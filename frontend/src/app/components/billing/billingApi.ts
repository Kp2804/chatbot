import { supabase } from "../../../lib/supabase";

export interface BillingPlan {
  id: string;
  name: string;
  price_monthly: number;
  message_limit: number | null;
  bot_limit: number | null;
  storage_limit: number | null;
  razorpay_plan_id: string | null;
}

export interface UserSubscription {
  id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
}

export interface BillingState {
  plans: BillingPlan[];
  subscription: UserSubscription | null;
}

export interface CreateSubscriptionResponse {
  subscription_id: string;
  short_url: string | null;
  status: string;
  razorpay_key_id: string;
  test_mode: boolean;
}

export interface VerifyPaymentPayload {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

const ACTIVE_STATUSES = new Set(["active", "past_due", "trialing"]);

async function callEdgeFunction<TResponse>(
  functionName: string,
  accessToken: string,
  body: object,
): Promise<TResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL in environment");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as TResponse;
}

export async function fetchBillingState(userId: string): Promise<BillingState> {
  const { data: plansData, error: plansError } = await supabase
    .from("plans")
    .select("*")
    .order("price_monthly", { ascending: true })
    .limit(3);

  if (plansError) {
    throw new Error(`Failed to load plans: ${plansError.message}`);
  }

  const normalizedPlans: BillingPlan[] = (plansData || []).map((plan: any) => ({
    id: String(plan.id),
    name: String(plan.name ?? "Plan"),
    price_monthly: Number(plan.price_monthly ?? 0),
    message_limit: plan.message_limit == null ? null : Number(plan.message_limit),
    bot_limit: plan.bot_limit == null ? null : Number(plan.bot_limit),
    storage_limit: plan.storage_limit == null ? null : Number(plan.storage_limit),
    razorpay_plan_id: typeof plan.razorpay_plan_id === "string" ? plan.razorpay_plan_id : null,
  }));

  const { data: subscriptionsData, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("id,plan_id,status,current_period_end,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (subscriptionsError) {
    throw new Error(`Failed to load subscription: ${subscriptionsError.message}`);
  }

  const subscription = (subscriptionsData || []).find((item) => ACTIVE_STATUSES.has(item.status))
    || subscriptionsData?.[0]
    || null;

  return {
    plans: normalizedPlans,
    subscription,
  };
}

export async function createSubscriptionSession(accessToken: string, planId: string): Promise<CreateSubscriptionResponse> {
  return callEdgeFunction<CreateSubscriptionResponse>("create-subscription", accessToken, {
    plan_id: planId,
    total_count: 12,
  });
}

export async function verifySubscriptionPayment(
  accessToken: string,
  payload: VerifyPaymentPayload,
): Promise<void> {
  await callEdgeFunction<{ success: boolean }>("verify-payment", accessToken, payload);
}
