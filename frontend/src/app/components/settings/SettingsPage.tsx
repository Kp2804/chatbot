import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Sun, Moon, User, CreditCard } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton, LoadingState } from "../ui/feedback";
import { fetchBillingState, type BillingPlan, type UserSubscription } from "../billing/billingApi";
import { PricingCard } from "../billing/PricingCard";

export function SettingsPage() {
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [chatbots, setChatbots] = useState<any[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    if (saved !== null) {
      const val = JSON.parse(saved);
      setIsDarkMode(val);
      applyTheme(val);
    }
  }, []);

  useEffect(() => {
    // load user's chatbots to offer "manage" links
    const fetch = async () => {
      try {
        setLoadError("");
        setLoadingBots(true);
        setLoadingBilling(true);
        const { data: userData } = await supabase.auth.getUser();
        const currentUser = userData.user;
        if (!currentUser) {
          navigate("/auth");
          return;
        }

        const { data, error } = await supabase
          .from("chatbots")
          .select("id,name")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setChatbots(data || []);

        const billingState = await fetchBillingState(currentUser.id);
        setPlans(billingState.plans);
        setSubscription(billingState.subscription);
      } catch (e) {
        console.error("Failed to load chatbots", e);
        setLoadError("We could not load your settings data. Please try again.");
      } finally {
        setLoadingBots(false);
        setLoadingBilling(false);
      }
    };
    fetch();
  }, [navigate]);

  const currentPlan = subscription
    ? plans.find((plan) => plan.id === subscription.plan_id) || null
    : null;

  const applyTheme = (dark: boolean) => {
    const html = document.documentElement;
    if (dark) html.classList.add("dark");
    else html.classList.remove("dark");
  };

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem("darkMode", JSON.stringify(next));
    applyTheme(next);
    toast.success(next ? "Dark mode enabled" : "Light mode enabled");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>

      {loadError && (
        <ErrorState
          message={loadError}
          onRetry={() => window.location.reload()}
          className="mb-4 max-w-xl"
        />
      )}

      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-between">
          <span className="font-medium">Dark mode</span>
          <button
            onClick={toggleTheme}
            className={`w-10 h-10 flex items-center justify-center rounded-full ${
              isDarkMode
                ? "bg-gray-200 dark:bg-[#1e1e2e]"
                : "bg-emerald-100 text-emerald-700"
            }`}
            title={isDarkMode ? "Switch to light" : "Switch to dark"}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div>
          <button
            onClick={() => navigate("/app/profile")}
            className="flex items-center gap-2 text-blue-600 hover:underline"
          >
            <User className="w-4 h-4" /> Manage profile
          </button>
        </div>

        <div>
          <p className="text-gray-600 dark:text-gray-400">More settings will be added here soon.</p>
        </div>

        {/* Billing section */}
        <div>
          <h2 className="text-lg font-medium mb-2 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Billing & Plans
          </h2>
          {loadingBilling ? (
            <LoadingState label="Loading billing..." />
          ) : (
            <>
              <div className="mb-3 p-3 rounded-xl border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5">
                <div className="text-sm text-gray-600 dark:text-gray-400">Current Plan</div>
                <div className="font-semibold text-black dark:text-white">
                  {currentPlan ? `${currentPlan.name} (${subscription?.status || "active"})` : "No active subscription"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/app/pricing")}
                className="mb-3 rounded-xl border border-gray-300 dark:border-white/10 px-3 py-2 text-sm hover:bg-gray-200 dark:hover:bg-white/10"
              >
                Open Pricing Page
              </button>

              {plans.length ? (
                <div className="space-y-4">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="max-w-md"
                    >
                      <PricingCard
                        plan={plan}
                        isCurrentPlan={plan.id === subscription?.plan_id}
                        isProcessing={false}
                        onUpgrade={() => navigate("/app/pricing")}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No plans available"
                  description="No billing plans were found. Seed plans in Supabase to manage subscriptions."
                  className="p-4"
                />
              )}
            </>
          )}
        </div>

        {/* Chatbots section */}
        <div>
          <h2 className="text-lg font-medium mb-2">Your chatbots</h2>
          {loadingBots ? (
            <ListSkeleton rows={3} />
          ) : chatbots.length ? (
            <ul className="space-y-2">
              {chatbots.map((bot) => (
                <li key={bot.id} className="flex justify-between items-center">
                  <span>{bot.name || "(untitled)"}</span>
                  <button
                    onClick={() => navigate(`/app/chat/${bot.id}/manage`)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Manage
                  </button>
                </li>
              ))}
            </ul>
          ) : (
              <EmptyState
                title="No bots yet"
                description="Create your first chatbot to configure behavior, billing limits, and integrations."
                actionLabel="Create chatbot"
                onAction={() => navigate("/app")}
                className="p-4"
              />
          )}
        </div>
      </div>
    </div>
  );
}
