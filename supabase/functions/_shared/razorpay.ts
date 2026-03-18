import { createHmac, timingSafeEqual } from "node:crypto";

const denoGlobal = (globalThis as unknown as { Deno?: { env?: { get: (key: string) => string | undefined } } }).Deno;
const RAZORPAY_KEY_ID = denoGlobal?.env?.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = denoGlobal?.env?.get("RAZORPAY_KEY_SECRET") ?? "";
const BILLING_TEST_MODE = (denoGlobal?.env?.get("BILLING_TEST_MODE") ?? "").toLowerCase() === "true"
  || (denoGlobal?.env?.get("BILLING_TEST_MODE") ?? "") === "1";

function ensureRazorpayCredentials() {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET env vars");
  }
}

const razorpayAuthHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

export function isBillingTestMode() {
  return BILLING_TEST_MODE;
}

export function getRazorpayKeyId() {
  return RAZORPAY_KEY_ID;
}

export async function createRazorpaySubscription(params: {
  razorpayPlanId: string;
  userId: string;
  localPlanId: string;
  totalCount?: number;
}) {
  ensureRazorpayCredentials();

  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      "Authorization": razorpayAuthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: params.razorpayPlanId,
      total_count: params.totalCount ?? 12,
      quantity: 1,
      customer_notify: 1,
      notes: {
        app_user_id: params.userId,
        local_plan_id: params.localPlanId,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.description || data?.error?.reason || "Failed to create Razorpay subscription";
    throw new Error(message);
  }

  return data;
}

export async function fetchRazorpaySubscription(razorpaySubscriptionId: string) {
  ensureRazorpayCredentials();

  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}`, {
    headers: {
      "Authorization": razorpayAuthHeader,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.description || "Failed to fetch Razorpay subscription";
    throw new Error(message);
  }

  return data;
}

export function verifyRazorpaySignature(params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  ensureRazorpayCredentials();

  const payload = `${params.paymentId}|${params.subscriptionId}`;
  const expected = createHmac("sha256", RAZORPAY_KEY_SECRET).update(payload).digest("hex");

  const expectedBuffer = new TextEncoder().encode(expected);
  const receivedBuffer = new TextEncoder().encode(params.signature);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
