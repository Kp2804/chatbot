import { corsHeaders } from "../_shared/cors.ts";
import { requireUser, supabaseAdmin } from "../_shared/auth.ts";
import { createRazorpaySubscription, getRazorpayKeyId, isBillingTestMode } from "../_shared/razorpay.ts";

const denoGlobal = (globalThis as unknown as { Deno?: { serve: (handler: (req: Request) => Promise<Response>) => void } }).Deno;

if (!denoGlobal?.serve) {
  throw new Error("This function must run on Supabase Edge Runtime (Deno)");
}

denoGlobal.serve(async (req: Request) => {
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
    const planId = body?.plan_id as string | undefined;
    const totalCount = typeof body?.total_count === "number" ? body.total_count : 12;

    if (!planId) {
      return new Response(JSON.stringify({ error: "plan_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("id,name,razorpay_plan_id")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isBillingTestMode() && !plan.razorpay_plan_id) {
      return new Response(JSON.stringify({ error: "This plan is not mapped to Razorpay" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const razorpaySubscription = isBillingTestMode()
      ? {
          id: `sub_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
          short_url: null,
          status: "created",
          test_mode: true,
        }
      : await createRazorpaySubscription({
          razorpayPlanId: plan.razorpay_plan_id,
          userId: user.id,
          localPlanId: plan.id,
          totalCount,
        });

    const { error: upsertError } = await supabaseAdmin.from("subscriptions").insert(
      {
        user_id: user.id,
        plan_id: plan.id,
        provider: "razorpay",
        razorpay_subscription_id: razorpaySubscription.id,
        status: "past_due",
        raw_payload: razorpaySubscription,
      }
    );

    if (upsertError) {
      return new Response(JSON.stringify({ error: `Failed to store subscription: ${upsertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        subscription_id: razorpaySubscription.id,
        short_url: razorpaySubscription.short_url,
        status: razorpaySubscription.status,
        razorpay_key_id: isBillingTestMode() ? "rzp_test_mock" : getRazorpayKeyId(),
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
