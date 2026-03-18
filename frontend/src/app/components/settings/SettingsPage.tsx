import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Sun, Moon, User, CreditCard } from "lucide-react";
import { supabase } from "../../../lib/supabase";

export function SettingsPage() {
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [chatbots, setChatbots] = useState<any[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);

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

        const { data: plansData, error: plansError } = await supabase
          .from("plans")
          .select("id,name,price_monthly,message_limit,bot_limit,storage_limit")
          .order("price_monthly", { ascending: true });
        if (plansError) throw plansError;
        setPlans(plansData || []);

        const { data: subData, error: subError } = await supabase
          .from("subscriptions")
          .select("id,plan_id,status,current_period_end,created_at")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (subError) throw subError;
        setSubscription(subData?.[0] || null);
      } catch (e) {
        console.error("Failed to load chatbots", e);
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
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-between">
          <span className="font-medium">Dark mode</span>
          <button
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-[#1e1e2e] rounded-full"
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
            <p className="text-gray-500">Loading billing…</p>
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
                <div className="space-y-2">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-3 rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-[#1e1e2e]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-black dark:text-white">{plan.name}</span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">${plan.price_monthly}/mo</span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {plan.message_limit} msgs, {plan.bot_limit} bots, {plan.storage_limit} storage
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No plans found. Seed plans in Supabase first.</p>
              )}
            </>
          )}
        </div>

        {/* Chatbots section */}
        <div>
          <h2 className="text-lg font-medium mb-2">Your chatbots</h2>
          {loadingBots ? (
            <p className="text-gray-500">Loading…</p>
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
            <p className="text-gray-500">You don&apos;t have any chatbots yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
