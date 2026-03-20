import { Loader2 } from "lucide-react";
import { cn } from "./utils";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({ title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-8 text-center", className)}>
      <h3 className="text-gray-900 dark:text-white text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 dark:from-violet-600 dark:to-indigo-700 dark:hover:from-violet-700 dark:hover:to-indigo-800"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

type LoadingStateProps = {
  label?: string;
  className?: string;
};

export function LoadingState({ label = "Loading...", className }: LoadingStateProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400", className)}>
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ title = "Something went wrong", message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("rounded-2xl border border-red-400/40 bg-red-500/10 p-4", className)}>
      <p className="text-sm font-semibold text-red-700 dark:text-red-300">{title}</p>
      <p className="mt-1 text-sm text-red-600 dark:text-red-200">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-red-500/30 bg-white/60 dark:bg-transparent px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-200 hover:bg-white dark:hover:bg-red-500/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-[1.8rem] border border-gray-200 dark:border-white/5 bg-white dark:bg-white/[0.02] p-6 animate-pulse">
      <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-white/10 mb-4" />
      <div className="h-8 w-20 bg-gray-200 dark:bg-white/10 rounded mb-2" />
      <div className="h-3 w-28 bg-gray-200 dark:bg-white/10 rounded" />
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-12 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5"
        />
      ))}
    </div>
  );
}
