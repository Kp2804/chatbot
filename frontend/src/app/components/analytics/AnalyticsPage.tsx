import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { MessageSquare, CheckCircle2, GitBranch, HelpCircle, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { toast } from "sonner";
import { EmptyState, ErrorState, MetricCardSkeleton } from "../ui/feedback";

interface ConversationSummary {
  id: string;
  updated_at: string;
}

export function AnalyticsPage() {
  const navigate = useNavigate();
  const PAGE_SIZE = 1000;
  const [loading, setLoading] = useState(true);
  const [totalChats, setTotalChats] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [resolvedRate, setResolvedRate] = useState(0);
  const [workflowCount, setWorkflowCount] = useState(0);
  const [publishedFaqCount, setPublishedFaqCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAllConversationIds = async () => {
    const ids = new Set<string>();
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const item of data) {
        ids.add(item.id);
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return ids;
  };

  const fetchResolvedConversationIds = async (conversationIds: Set<string>) => {
    const resolvedIds = new Set<string>();
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("role", "assistant")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const item of data) {
        if (conversationIds.has(item.conversation_id)) {
          resolvedIds.add(item.conversation_id);
        }
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return resolvedIds;
  };

  const fetchAnalytics = async (showSuccessToast = false) => {
    try {
      setLoading(true);
      setErrorMessage("");

      const [conversationIds, { count: workflowTotal, error: workflowsError }, { count: publishedFaqTotal, error: faqsError }] = await Promise.all([
        fetchAllConversationIds(),
        supabase.from("workflows").select("id", { count: "exact", head: true }),
        supabase.from("faqs").select("id", { count: "exact", head: true }).eq("status", "published"),
      ]);

      if (workflowsError) throw workflowsError;
      if (faqsError) throw faqsError;

      const resolvedConversationIds = await fetchResolvedConversationIds(conversationIds);

      const resolved = resolvedConversationIds.size;
      const total = conversationIds.size;
      setTotalChats(total);
      setResolvedCount(resolved);
      setResolvedRate(total ? Math.round((resolved / total) * 100) : 0);
      setWorkflowCount(workflowTotal || 0);
      setPublishedFaqCount(publishedFaqTotal || 0);
      if (showSuccessToast) {
        toast.success("Analytics refreshed");
      }
    } catch (error: any) {
      console.error("Analytics fetch failed:", error.message);
      setErrorMessage(error?.message || "We could not load analytics right now.");
      if (showSuccessToast) {
        toast.error("Failed to refresh analytics");
      }
    } finally {
      setLoading(false);
    }
  };

  const hasNoData = !loading && !errorMessage && totalChats === 0 && workflowCount === 0 && publishedFaqCount === 0;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-[#08080c]">
      <div className="max-w-6xl mx-auto p-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-gray-900 dark:text-white mb-2 leading-none" style={{ fontSize: "2.5rem", fontWeight: 900, letterSpacing: "-0.03em" }}>
              Analysis
            </h1>
            <p className="text-gray-500 dark:text-gray-500 font-bold uppercase tracking-[0.2em]" style={{ fontSize: "0.7rem" }}>
              Live platform metrics
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchAnalytics(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-xl text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {errorMessage && (
          <ErrorState
            message="Unable to fetch analytics right now. Please retry in a few seconds."
            onRetry={() => fetchAnalytics(true)}
            className="mb-6"
          />
        )}

        {loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        )}

        {hasNoData && (
          <EmptyState
            title="No analytics data yet"
            description="Start a chat, publish an FAQ, or build a workflow to see performance metrics here."
            actionLabel="Open bots"
            onAction={() => navigate("/app")}
            className="mb-10"
          />
        )}

        {!loading && !hasNoData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[1.8rem] p-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center mb-4">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="text-gray-900 dark:text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>{totalChats}</div>
            <div className="text-gray-500 dark:text-gray-300 font-bold uppercase tracking-widest" style={{ fontSize: "0.62rem" }}>Total Chats</div>
          </div>

          <div className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[1.8rem] p-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="text-gray-900 dark:text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>{resolvedRate}%</div>
            <div className="text-gray-500 dark:text-gray-300 font-bold uppercase tracking-widest" style={{ fontSize: "0.62rem" }}>Resolved Rate</div>
            <div className="text-gray-600 dark:text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>{resolvedCount} resolved chats</div>
          </div>

          <div className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[1.8rem] p-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
              <GitBranch className="w-5 h-5" />
            </div>
            <div className="text-gray-900 dark:text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>{workflowCount}</div>
            <div className="text-gray-500 dark:text-gray-300 font-bold uppercase tracking-widest" style={{ fontSize: "0.62rem" }}>Workflows</div>
          </div>

          <div className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[1.8rem] p-6">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="text-gray-900 dark:text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>{publishedFaqCount}</div>
            <div className="text-gray-500 dark:text-gray-300 font-bold uppercase tracking-widest" style={{ fontSize: "0.62rem" }}>Published FAQs</div>
          </div>
        </div>
        )}

        {!loading && (
        <div className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2rem] p-8">
          <p className="text-gray-600 dark:text-gray-300" style={{ fontSize: "0.9rem" }}>
            Metrics are calculated from all-time Supabase data. "Resolved" is based on conversations that have at least one assistant response.
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
