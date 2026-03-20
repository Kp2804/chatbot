import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { LoadingState } from "../ui/feedback";

type UsageData = {
  planName: string;
  messagesUsed: number;
  messageLimit: number | null;
  botsUsed: number;
  botLimit: number | null;
  storageUsedMb: number;
  storageLimitMb: number | null;
};

const ACTIVE_STATUSES = new Set(["active", "past_due", "trialing"]);

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPercent(used: number, limit: number | null) {
  if (limit == null || limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function formatStorage(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(2)} MB`;
}

function UsageProgressCard({
  label,
  value,
  subLabel,
  percent,
  gradient,
}: {
  label: string;
  value: string;
  subLabel: string;
  percent: number;
  gradient: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-300 dark:border-white/10 bg-white dark:bg-[#171720] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-md bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
          {subLabel}
        </span>
      </div>

      <div className="mt-4 h-2.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${gradient}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function UsageDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<UsageData | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      setError("");
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const user = userData.user;
      if (!user) {
        setUsage(null);
        return;
      }

      const [usageResult, botCountResult, subscriptionsResult] = await Promise.all([
        supabase
          .from("usage")
          .select("messages_used,storage_used")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("chatbots")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("subscriptions")
          .select("plan_id,status,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (usageResult.error) throw usageResult.error;
      if (botCountResult.error) throw botCountResult.error;
      if (subscriptionsResult.error) throw subscriptionsResult.error;

      const subscriptions = subscriptionsResult.data || [];
      const selectedSubscription = subscriptions.find((row) => ACTIVE_STATUSES.has(row.status)) || subscriptions[0] || null;

      let planName = "Starter";
      let messageLimit: number | null = null;
      let botLimit: number | null = null;
      let storageLimitMb: number | null = null;

      if (selectedSubscription?.plan_id) {
        const { data: planData, error: planError } = await supabase
          .from("plans")
          .select("name,message_limit,bot_limit,storage_limit")
          .eq("id", selectedSubscription.plan_id)
          .maybeSingle();

        if (planError) throw planError;

        if (planData) {
          planName = typeof planData.name === "string" ? planData.name : planName;
          messageLimit = planData.message_limit == null ? null : toNumber(planData.message_limit);
          botLimit = planData.bot_limit == null ? null : toNumber(planData.bot_limit);
          storageLimitMb = planData.storage_limit == null ? null : toNumber(planData.storage_limit);
        }
      }

      setUsage({
        planName,
        messagesUsed: toNumber(usageResult.data?.messages_used, 0),
        messageLimit,
        botsUsed: toNumber(botCountResult.count, 0),
        botLimit,
        storageUsedMb: toNumber(usageResult.data?.storage_used, 0),
        storageLimitMb,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load usage details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsage();

    let mounted = true;
    let usageChannel: ReturnType<typeof supabase.channel> | null = null;
    let chatbotChannel: ReturnType<typeof supabase.channel> | null = null;
    let subscriptionChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || !mounted) return;

      usageChannel = supabase
        .channel(`billing-usage-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "usage", filter: `user_id=eq.${user.id}` },
          () => {
            void fetchUsage();
          },
        )
        .subscribe();

      chatbotChannel = supabase
        .channel(`billing-chatbots-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chatbots", filter: `user_id=eq.${user.id}` },
          () => {
            void fetchUsage();
          },
        )
        .subscribe();

      subscriptionChannel = supabase
        .channel(`billing-subscriptions-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
          () => {
            void fetchUsage();
          },
        )
        .subscribe();
    };

    void setupRealtime();

    const intervalId = window.setInterval(() => {
      void fetchUsage();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      if (usageChannel) void supabase.removeChannel(usageChannel);
      if (chatbotChannel) void supabase.removeChannel(chatbotChannel);
      if (subscriptionChannel) void supabase.removeChannel(subscriptionChannel);
    };
  }, [fetchUsage]);

  const stats = useMemo(() => {
    if (!usage) return null;
    return {
      messagePercent: toPercent(usage.messagesUsed, usage.messageLimit),
      botPercent: toPercent(usage.botsUsed, usage.botLimit),
      storagePercent: toPercent(usage.storageUsedMb, usage.storageLimitMb),
    };
  }, [usage]);

  return (
    <section className="rounded-3xl border border-gray-300 dark:border-white/10 bg-white dark:bg-[#12121a] p-5 md:p-6 mb-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-black dark:text-white">Usage Dashboard</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {usage?.planName ? `${usage.planName} plan usage` : "Track your usage and limits in real time"}
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading usage metrics..." className="py-10" />
      ) : error ? (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          We could not load usage metrics right now. Please try again in a moment.
        </div>
      ) : !usage || !stats ? (
        <div className="rounded-xl border border-gray-300 dark:border-white/10 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          No usage data available yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <UsageProgressCard
            label="Messages"
            value={`${usage.messagesUsed} / ${usage.messageLimit ?? "Unlimited"}`}
            subLabel={`${stats.messagePercent}%`}
            percent={stats.messagePercent}
            gradient="bg-gradient-to-r from-violet-500 to-indigo-500"
          />

          <UsageProgressCard
            label="Bots"
            value={`${usage.botsUsed} / ${usage.botLimit ?? "Unlimited"}`}
            subLabel={`${stats.botPercent}%`}
            percent={stats.botPercent}
            gradient="bg-gradient-to-r from-emerald-500 to-teal-500"
          />

          <UsageProgressCard
            label="Storage"
            value={`${formatStorage(usage.storageUsedMb)} / ${usage.storageLimitMb == null ? "Unlimited" : formatStorage(usage.storageLimitMb)}`}
            subLabel={`${stats.storagePercent}%`}
            percent={stats.storagePercent}
            gradient="bg-gradient-to-r from-amber-500 to-orange-500"
          />
        </div>
      )}
    </section>
  );
}
