import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard } from "lucide-react";
import { useNavigate } from "react-router";
import { getAccessToken, supabase } from "../../../lib/supabase";
import {
  type BillingPlan,
  createSubscriptionSession,
  fetchBillingState,
  verifySubscriptionPayment,
} from "./billingApi";
import { PricingCard, PricingCardSkeleton } from "./PricingCard";

declare global {
  interface Window {
    Razorpay?: {
      new (options: RazorpayOptions): { open: () => void };
    };
  }
}

type RazorpayPaymentResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  prefill?: {
    email?: string;
  };
  theme?: {
    color?: string;
  };
};

let razorpayScriptPromise: Promise<void> | null = null;

function ensureRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout"));
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

export function PricingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  const loadPageData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData.user;
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUserEmail(currentUser.email || "");
      const billingState = await fetchBillingState(currentUser.id);
      setPlans(billingState.plans);
      setCurrentPlanId(billingState.subscription?.plan_id || null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load pricing";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const showCards = useMemo(() => plans.slice(0, 3), [plans]);

  const handleUpgrade = useCallback(
    async (plan: BillingPlan) => {
      if (plan.id === currentPlanId) return;

      try {
        setProcessingPlanId(plan.id);
        setError(null);

        const accessToken = await getAccessToken();
        if (!accessToken) {
          navigate("/auth");
          return;
        }

        const checkoutSession = await createSubscriptionSession(accessToken, plan.id);

        if (!checkoutSession.razorpay_key_id || checkoutSession.razorpay_key_id === "rzp_test_mock") {
          if (checkoutSession.short_url) {
            window.location.assign(checkoutSession.short_url);
            return;
          }
          throw new Error("Razorpay key is not configured yet. Add your Razorpay API keys in Supabase secrets.");
        }

        await ensureRazorpayScript();
        if (!window.Razorpay) {
          throw new Error("Razorpay checkout is unavailable in this browser");
        }

        const razorpayCheckout = new window.Razorpay({
          key: checkoutSession.razorpay_key_id,
          subscription_id: checkoutSession.subscription_id,
          name: "NexusBot",
          description: `${plan.name} plan subscription`,
          prefill: {
            email: userEmail,
          },
          theme: {
            color: "#0f766e",
          },
          handler: async (response) => {
            try {
              const latestToken = await getAccessToken();
              if (!latestToken) {
                throw new Error("Session expired. Please login again.");
              }

              await verifySubscriptionPayment(latestToken, {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              });

              await loadPageData();
            } catch (verificationError) {
              const message = verificationError instanceof Error
                ? verificationError.message
                : "Payment verification failed";
              setError(message);
            } finally {
              setProcessingPlanId(null);
            }
          },
          modal: {
            ondismiss: () => {
              setProcessingPlanId(null);
            },
          },
        });

        razorpayCheckout.open();
      } catch (checkoutError) {
        const message = checkoutError instanceof Error ? checkoutError.message : "Checkout failed";
        setError(message);
        setProcessingPlanId(null);
      }
    },
    [currentPlanId, loadPageData, navigate, userEmail],
  );

  return (
    <div className="p-6 md:p-8">
      <section className="max-w-6xl mx-auto">
        <div className="rounded-3xl border border-gray-300 dark:border-white/10 bg-gradient-to-r from-white to-teal-50 dark:from-[#12121a] dark:to-[#122022] p-6 md:p-8 mb-6">
          <div className="flex items-center gap-2 mb-2 text-teal-700 dark:text-teal-300">
            <CreditCard className="w-4 h-4" />
            <span className="text-sm font-medium">Billing</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-black dark:text-white">Choose your plan</h1>
          <p className="text-gray-700 dark:text-gray-300 mt-2">
            Plans are loaded from your database and checkout runs through Razorpay subscriptions.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <div>
              <p className="font-medium">Something went wrong</p>
              <p className="text-sm">{error}</p>
              <button
                type="button"
                onClick={loadPageData}
                className="mt-2 text-sm underline"
              >
                Retry loading plans
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          {loading && [1, 2, 3].map((item) => <PricingCardSkeleton key={item} />)}

          {!loading && showCards.length === 0 && (
            <div className="md:col-span-3 rounded-2xl border border-gray-300 dark:border-white/10 bg-white dark:bg-[#171720] p-8 text-center text-gray-600 dark:text-gray-300">
              No active plans found. Add or seed plans in your `plans` table.
            </div>
          )}

          {!loading && showCards.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={plan.id === currentPlanId}
              isProcessing={processingPlanId === plan.id}
              onUpgrade={handleUpgrade}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
