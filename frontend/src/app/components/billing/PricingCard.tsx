import { CheckCircle2 } from "lucide-react";
import type { BillingPlan } from "./billingApi";

type PricingCardProps = {
  plan: BillingPlan;
  isCurrentPlan: boolean;
  isProcessing: boolean;
  onUpgrade: (plan: BillingPlan) => void;
};

const formatStorageLimit = (value: number | null): string => {
  if (!value || value <= 0) return "-";

  if (value >= 1024) {
    return `${Math.round(value / 1024)} GB`;
  }

  return `${Math.round(value)} MB`;
};

export function PricingCard({ plan, isCurrentPlan, isProcessing, onUpgrade }: PricingCardProps) {
  return (
    <article
      className={`rounded-2xl border p-6 transition-all ${
        isCurrentPlan
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-gray-300 dark:border-white/10 bg-white dark:bg-[#171720]"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-black dark:text-white">{plan.name}</h3>
        {isCurrentPlan && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Current
          </span>
        )}
      </div>

      <div className="mb-5">
        <div className="text-3xl font-bold text-black dark:text-white">${plan.price_monthly}</div>
        <p className="text-sm text-gray-600 dark:text-gray-400">per month</p>
      </div>

      <ul className="space-y-2 text-sm mb-6 text-gray-700 dark:text-gray-300">
        <li>{plan.message_limit ?? "-"} messages / month</li>
        <li>{plan.bot_limit ?? "-"} chatbots</li>
        <li>{formatStorageLimit(plan.storage_limit)} storage</li>
      </ul>

      <button
        type="button"
        onClick={() => onUpgrade(plan)}
        disabled={isCurrentPlan || isProcessing}
        className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-purple-600 dark:hover:bg-purple-700 dark:text-white py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isCurrentPlan ? "Current Plan" : isProcessing ? "Starting checkout..." : "Upgrade"}
      </button>
    </article>
  );
}

export function PricingCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-300 dark:border-white/10 bg-white dark:bg-[#171720] p-6 animate-pulse">
      <div className="h-6 w-24 rounded bg-gray-200 dark:bg-white/10 mb-4" />
      <div className="h-10 w-20 rounded bg-gray-200 dark:bg-white/10 mb-2" />
      <div className="h-4 w-28 rounded bg-gray-200 dark:bg-white/10 mb-5" />
      <div className="space-y-2 mb-6">
        <div className="h-4 w-full rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-white/10" />
      </div>
      <div className="h-10 w-full rounded bg-gray-200 dark:bg-white/10" />
    </div>
  );
}
