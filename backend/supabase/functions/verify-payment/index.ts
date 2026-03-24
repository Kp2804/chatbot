// @ts-ignore - Deno global available in Supabase Edge Runtime
import { buildCorsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { requireUser, supabaseAdmin } from "../_shared/auth.ts";
import { fetchRazorpaySubscription, isBillingTestMode, verifyRazorpaySignature } from "../_shared/razorpay.ts";

function toIsoFromEpoch(epochSeconds?: number): string | null {
  if (!epochSeconds || Number.isNaN(epochSeconds)) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

const denoGlobal = (globalThis as unknown as { Deno?: { serve: (handler: (req: Request) => Promise<Response>) => void } }).Deno;

if (!denoGlobal?.serve) {
  throw new Error("This function must run on Supabase Edge Runtime (Deno)");
}

denoGlobal.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (!isAllowedOrigin(req.headers.get("origin"), true)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    const razorpayPaymentId = body?.razorpay_payment_id as string | undefined;
    const razorpaySubscriptionId = body?.razorpay_subscription_id as string | undefined;
    const razorpaySignature = body?.razorpay_signature as string | undefined;

    if (!razorpaySubscriptionId) {
      return new Response(JSON.stringify({ error: "razorpay_subscription_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isBillingTestMode() && (!razorpayPaymentId || !razorpaySignature)) {
      return new Response(JSON.stringify({ error: "Missing payment verification fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isBillingTestMode()) {
      const valid = verifyRazorpaySignature({
        paymentId: razorpayPaymentId!,
        subscriptionId: razorpaySubscriptionId,
        signature: razorpaySignature!,
      });

      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid Razorpay signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: localSubscription, error: localSubscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,user_id,plan_id")
      .eq("razorpay_subscription_id", razorpaySubscriptionId)
      .single();

    if (localSubscriptionError || !localSubscription) {
      return new Response(JSON.stringify({ error: "Local subscription record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (localSubscription.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const razorpaySubscription = isBillingTestMode()
      ? {
          id: razorpaySubscriptionId,
          status: "active",
          current_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          test_mode: true,
        }
      : await fetchRazorpaySubscription(razorpaySubscriptionId);

    const currentPeriodEnd = toIsoFromEpoch(razorpaySubscription.current_end);
    const normalizedStatus = razorpaySubscription.status === "active" ? "active" : "past_due";
    const effectivePaymentId = razorpayPaymentId || `pay_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: normalizedStatus,
        current_period_end: currentPeriodEnd,
        razorpay_payment_id: effectivePaymentId,
        raw_payload: razorpaySubscription,
      })
      .eq("id", localSubscription.id)
      .eq("user_id", user.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: `Failed to update subscription: ${updateError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingUsage, error: usageReadError } = await supabaseAdmin
      .from("usage")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (usageReadError) {
      console.warn("usage read warning:", usageReadError.message);
    } else if (!existingUsage || existingUsage.length === 0) {
      const { error: usageInsertError } = await supabaseAdmin
        .from("usage")
        .insert({ user_id: user.id });
      if (usageInsertError) {
        console.warn("usage insert warning:", usageInsertError.message);
      }
    }

    await supabaseAdmin.from("logs").insert({
      user_id: user.id,
      type: "info",
      message: `Razorpay subscription verified: ${razorpaySubscriptionId}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        status: normalizedStatus,
        current_period_end: currentPeriodEnd,
        test_mode: isBillingTestMode(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unexpected server error",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
