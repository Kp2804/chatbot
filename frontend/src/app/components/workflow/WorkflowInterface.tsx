import { useState, useRef, useEffect } from "react";
import * as Icons from "lucide-react";
import {
  Plus, Play, Pause, Edit2, Trash2, Copy, MoreVertical,
  GitBranch, CheckCircle2, XCircle, Clock, Zap, MessageSquare,
  Mail, Globe, Database, ArrowRight, Filter, Search,
  ChevronDown, ChevronRight, X, AlertTriangle, GripVertical,
  ArrowUp, ArrowDown, Layout, Menu, Settings, List, RefreshCw, Lock
} from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { supabase } from "../../../lib/supabase";
import { fetchBillingState } from "../billing/billingApi";
import { useUserRole } from "../../hooks/useUserRole";

/* ─── Types ─── */

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action';
  name: string;
  message: string;
  position: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

interface Workflow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "draft";
  triggers: number;
  run_count: number;
  success_rate: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  tags: string[];
  created_at: string;
  updated_at: string;
  steps?: any[]; // For DB compatibility
}

const migrateWorkflow = (wf: any): Workflow => {
  // If we have a serialized graph in `steps`, use it
  if (wf.steps && !Array.isArray(wf.steps) && typeof wf.steps === 'object' && wf.steps.nodes) {
    return { ...wf, nodes: wf.steps.nodes, edges: wf.steps.edges };
  }

  if (wf.nodes && wf.edges) return wf as Workflow;

  const nodes: WorkflowNode[] = (wf.steps || []).map((step: any, index: number) => ({
    id: step.id,
    type: index === 0 ? 'trigger' : 'action',
    name: step.label || `Node ${index + 1}`,
    message: step.message,
    position: step.position || { x: index * 320 + 100, y: 200 }
  }));

  const edges: WorkflowEdge[] = [];
  (wf.steps || []).forEach((step: any) => {
    (step.options || []).forEach((opt: any) => {
      if (opt.nextStepId) {
        edges.push({
          id: opt.id || `edge_${Date.now()}_${Math.random()}`,
          source: step.id,
          target: opt.nextStepId
        });
      }
    });
  });

  return {
    ...wf,
    nodes: nodes.length > 0 ? nodes : [{
      id: 'trigger',
      type: 'trigger',
      name: 'Start',
      message: 'Hello! How can I help you today?',
      position: { x: 100, y: 200 }
    }],
    edges
  } as Workflow;
};

/* ─── Sub-components ─── */

function StatusBadge({ status }: { status: Workflow["status"] }) {
  const styles = {
    active: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    paused: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    draft: "bg-gray-500/10 border-gray-500/20 text-gray-400"
  };
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-full ${styles[status]}`} style={{ fontSize: "0.72rem", fontWeight: 600 }}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-400 dark:bg-violet-400 animate-pulse' : 'bg-current'}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ToastNotification({ message, type }: { message: string; type: "success" | "info" }) {
  return (
    <div className="fixed top-24 right-8 z-[100] animate-in slide-in-from-right-10 fade-in duration-300">
      <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md ${type === "success"
        ? "bg-emerald-500/10 dark:bg-violet-500/10 border-emerald-500/20 dark:border-violet-500/20 text-emerald-400 dark:text-violet-300"
        : "bg-blue-500/10 border-blue-500/20 text-blue-400"
        }`} style={{ fontSize: "0.9rem", fontWeight: 500 }}>
        <CheckCircle2 className="w-5 h-5" />
        {message}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-[#1a1a24] border border-gray-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-gray-900 dark:text-white text-xl font-bold">{title}</h3>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed" style={{ fontSize: "0.9rem" }}>{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 rounded-xl transition-all font-bold text-sm">Dismiss</button>
          <button type="button" onClick={onConfirm} className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all font-bold text-sm shadow-lg shadow-red-500/20">Confirm Deletion</button>
        </div>
      </motion.div>
    </div>
  );
}


/* ─── Main Interface Component ─── */

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "past_due", "trialing"]);

export function WorkflowInterface() {
  const navigate = useNavigate();
  const { loading: roleLoading, isAdmin } = useUserRole();
  const activeChatbotId = localStorage.getItem("activeChatbotId");
  const hasActiveChatbot = Boolean(activeChatbotId);
  const previewSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused" | "draft">("all");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);
  const [previewModeByWorkflow, setPreviewModeByWorkflow] = useState<Record<string, "structure" | "visual">>({});
  const [hasActivePlan, setHasActivePlan] = useState(false);

  useEffect(() => {
    const loadBillingState = async () => {
      try {
        if (roleLoading) {
          setBillingLoaded(false);
          return;
        }

        // Admins bypass subscription checks.
        if (isAdmin) {
          setHasActivePlan(true);
          setBillingLoaded(true);
          return;
        }

        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const billingState = await fetchBillingState(userData.user.id);
          const isPlanActive = billingState.subscription
            ? ACTIVE_SUBSCRIPTION_STATUSES.has(String(billingState.subscription.status || "").toLowerCase())
            : false;
          setHasActivePlan(isPlanActive);
        }
      } catch (error) {
        console.error('Failed to load billing state:', error);
      } finally {
        setBillingLoaded(true);
      }
    };
    loadBillingState();
  }, [roleLoading, isAdmin]);

  const canManageWorkflows = isAdmin || hasActivePlan;

  useEffect(() => {
    if (!activeChatbotId) return;
    fetchWorkflows();
  }, [activeChatbotId]);

  const fetchWorkflows = async () => {
    if (!activeChatbotId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('chatbot_id', activeChatbotId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWorkflows((data || []).map(migrateWorkflow));
    } catch (error: any) {
      console.error('Fetch error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: "success" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = workflows.filter((w) => {
    const matchStatus = filterStatus === "all" || w.status === filterStatus;
    const matchSearch =
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.description.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });


  const handleDuplicate = async (wf: Workflow) => {
    if (!canManageWorkflows) {
      showToast("Duplicate workflow requires an active plan", "info");
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Identification missing.");

      const dup = {
        user_id: user.id,
        chatbot_id: activeChatbotId,
        name: `${wf.name} (Clone)`,
        description: wf.description,
        status: "draft",
        steps: {
          nodes: wf.nodes.map((n) => ({ ...n, id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
          edges: wf.edges.map((e) => ({ ...e, id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }))
        },
        tags: wf.tags,
        triggers: 0,
        runs: 0,
        success_rate: 0
      };

      const { data, error } = await supabase
        .from('workflows')
        .insert([dup])
        .select()
        .single();

      if (error) throw error;
      setWorkflows((prev) => [migrateWorkflow(data), ...prev]);
      showToast("Instance replication complete.");
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    if (!canManageWorkflows) {
      showToast("Saving workflow status requires an active plan", "info");
      return;
    }
    try {
      const next: Workflow["status"] = currentStatus === "active" ? "paused" : "active";
      const { error } = await supabase
        .from('workflows')
        .update({ status: next })
        .eq('id', id);

      if (error) throw error;
      setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, status: next } : w)));
      showToast(next === "active" ? "System initialized." : "System suspended.");
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageWorkflows) {
      showToast("Deleting workflows requires an active plan", "info");
      return;
    }
    try {
      const { error } = await supabase
        .from('workflows')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (expandedId === id) setExpandedId(null);
      setDeleteConfirm(null);
      showToast("Entity permanently purged.");
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };

  const activeCount = workflows.filter((w) => w.status === "active").length;
  const totalRuns = workflows.reduce((sum, w) => sum + (w.run_count || 0), 0);
  const avgSuccess = workflows.length > 0
    ? (workflows.reduce((sum, w) => sum + (w.success_rate || 0), 0) / workflows.length).toFixed(1)
    : "0";

  const handleVisualPreview = (workflowId: string) => {
    const isOpen = expandedId === workflowId;
    setExpandedId(isOpen ? null : workflowId);

    if (!isOpen) {
      window.setTimeout(() => {
        previewSectionRefs.current[workflowId]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }, 50);
    }
  };

  const getPreviewMode = (workflowId: string) => previewModeByWorkflow[workflowId] || "structure";

  const setPreviewMode = (workflowId: string, mode: "structure" | "visual") => {
    setPreviewModeByWorkflow((prev) => ({ ...prev, [workflowId]: mode }));
  };

  if (!roleLoading && billingLoaded && !canManageWorkflows) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-[#08080c]">
        <div className="max-w-md text-center">
          <Lock className="w-16 h-16 mx-auto mb-6 text-emerald-600 dark:text-violet-600" />
          <h2 className="text-gray-900 dark:text-white mb-2" style={{ fontSize: "1.5rem", fontWeight: 700 }}>Plan Required</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8" style={{ fontSize: "0.95rem" }}>You need an active subscription to create and manage workflows. Choose a plan to get started.</p>
          <button
            type="button"
            onClick={() => navigate("/app/pricing")}
            className="px-8 py-3 bg-gradient-to-br from-emerald-600 to-teal-700 dark:from-violet-600 dark:to-indigo-800 hover:from-emerald-700 hover:to-teal-800 dark:hover:from-violet-500 dark:hover:to-indigo-700 text-white rounded-2xl transition-all font-bold shadow-lg"
            style={{ fontSize: "1rem" }}
          >
            View Pricing Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-[#08080c]">
      <div className="max-w-6xl mx-auto p-10">
        {toast && <ToastNotification message={toast.message} type={toast.type} />}

        <div className="flex items-end justify-between mb-12">
          <div>
            <h1 className="text-gray-900 dark:text-white mb-2 leading-none" style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: '-0.04em' }}>Logic Flows</h1>
            <p className="text-gray-400 dark:text-gray-500 font-bold uppercase tracking-[0.2em]" style={{ fontSize: "0.7rem" }}>Visual Orchestration Engine</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(hasActiveChatbot ? "/app/workflows/new" : "/app")}
            className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-br from-emerald-600 to-teal-700 dark:from-violet-600 dark:to-indigo-800 hover:from-emerald-700 hover:to-teal-800 dark:hover:from-violet-500 dark:hover:to-indigo-700 text-white rounded-3xl transition-all shadow-3xl shadow-emerald-600/30 dark:shadow-violet-600/30 font-black tracking-tight"
            style={{ fontSize: "1rem" }}
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
            {hasActiveChatbot ? "Establish Workflow" : "Select Chatbot to Build"}
          </button>
        </div>

        {!hasActiveChatbot && (
          <div className="mb-8 rounded-2xl border border-amber-300/40 bg-amber-100/70 dark:border-amber-500/40 dark:bg-amber-500/10 px-4 py-3">
            <p className="text-amber-900 dark:text-amber-200" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Preview mode: you can explore workflow UI and structure. Select a chatbot from sidebar to create and save real workflows.
            </p>
          </div>
        )}

        <div className="grid grid-cols-4 gap-6 mb-12">
          {[
            { label: "Active Nodes", value: activeCount.toString(), desc: "Online Instances", color: "from-emerald-500/20" },
            { label: "Total Flows", value: workflows.length.toString(), desc: "Global Inventory", color: "from-violet-500/10 dark:from-violet-500/20" },
            { label: "Aggregated Runs", value: totalRuns.toLocaleString(), desc: "Execution Metric", color: "from-blue-500/10" },
            { label: "Avg Precision", value: `${avgSuccess}%`, desc: "System Accuracy", color: "from-amber-500/10" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-[2rem] p-7 transition-all hover:bg-gray-50 dark:hover:bg-white/[0.04]">
              <div className="text-gray-900 dark:text-white mb-1" style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: '-0.02em' }}>{stat.value}</div>
              <div className="text-gray-400 dark:text-gray-400 font-black uppercase tracking-widest mb-1" style={{ fontSize: "0.6rem" }}>{stat.label}</div>
              <div className="text-gray-500 dark:text-gray-600 text-xs font-medium">{stat.desc}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-5 mb-10">
          <div className="flex items-center gap-3 bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/10 rounded-[1.5rem] px-5 py-4 flex-1 max-w-md focus-within:border-emerald-600/50 dark:focus-within:border-violet-600/50 transition-all">
            <Search className="w-5 h-5 text-gray-400 dark:text-gray-700" />
            <input
              type="text"
              placeholder="Search automated infrastructures..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-gray-700 dark:text-gray-400 placeholder-gray-400 dark:placeholder-gray-800 focus:outline-none w-full font-medium"
              style={{ fontSize: "0.95rem" }}
            />
          </div>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-black/40 rounded-[1.5rem] p-1.5 border border-gray-200 dark:border-white/5">
            {(["all", "active", "paused", "draft"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`px-5 py-2.5 rounded-2xl capitalize transition-all font-black text-[0.65rem] tracking-widest ${filterStatus === s
                  ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-xl shadow-white/5"
                  : "text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {filtered.length === 0 ? (
            <div className="text-center py-32 bg-white dark:bg-[#111019] border-2 border-dashed border-emerald-200 dark:border-purple-500/30 rounded-[3rem]">
              <GitBranch className="w-20 h-20 mx-auto mb-6 text-emerald-100 dark:text-purple-500/20" />
              <p className="text-gray-400 dark:text-gray-500 font-black uppercase tracking-[0.3em] text-[0.7rem] mb-2">Registry Void</p>
              <p className="text-gray-400 dark:text-gray-700 font-bold" style={{ fontSize: "0.9rem" }}>No workflow entities detected matching current filters.</p>
            </div>
          ) : (
            filtered.map((workflow) => (
              <div key={workflow.id} className="group bg-white dark:bg-[#0f0f15] hover:bg-gray-50 dark:hover:bg-[#12121c] border border-gray-200 dark:border-white/5 hover:border-emerald-500/30 dark:hover:border-violet-500/30 rounded-[2.5rem] overflow-hidden transition-all duration-500">
                <div className="p-8">
                  <div className="flex items-center justify-between gap-8">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="w-16 h-16 bg-gradient-to-br from-emerald-600/10 to-teal-600/10 dark:from-violet-600/10 dark:to-indigo-600/10 border border-gray-200 dark:border-white/5 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-700">
                        <GitBranch className="w-8 h-8 text-emerald-600 dark:text-violet-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-gray-900 dark:text-white text-xl font-black tracking-tight">{workflow.name}</h3>
                          <StatusBadge status={workflow.status} />
                        </div>
                        <p className="text-gray-500 dark:text-gray-600 font-medium line-clamp-1 max-w-lg" style={{ fontSize: "0.9rem" }}>{workflow.description || "System overview unconfigured."}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-3 mr-4">
                        {(workflow.tags || []).slice(0, 3).map((tag) => (
                          <div key={tag} className="px-3 py-1.5 bg-gray-100 dark:bg-[#1a1a24] border border-gray-200 dark:border-white/10 rounded-xl text-[0.6rem] font-bold text-gray-500 uppercase tracking-widest shadow-2xl">
                            {tag}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleVisualPreview(workflow.id)}
                        className="flex items-center gap-2.5 px-6 py-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-[1.2rem] text-gray-700 dark:text-white transition-all font-black text-xs uppercase tracking-widest"
                      >
                        {expandedId === workflow.id ? "Hide Preview" : "Visual Preview"}
                        <ChevronRight className={`w-4 h-4 transition-transform duration-500 ${expandedId === workflow.id ? 'rotate-90' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-8 pt-8 border-t border-gray-100 dark:border-white/5">
                    <div className="text-gray-700 dark:text-gray-300 font-black text-lg">{(workflow.nodes || []).length}</div>
                    <div className="text-gray-400 dark:text-gray-700 font-black uppercase tracking-widest" style={{ fontSize: "0.55rem" }}>Nodes</div>
                  </div>
                </div>

                {expandedId === workflow.id && (
                  <div
                    ref={(el) => {
                      previewSectionRefs.current[workflow.id] = el;
                    }}
                    className="border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-[#0f0f15] p-10 animate-in fade-in slide-in-from-top-4 duration-500"
                  >
                    <div className="flex items-center justify-between mb-8 px-2">
                      <div className="flex items-center gap-6">
                        <button
                          type="button"
                          onClick={() => setPreviewMode(workflow.id, "structure")}
                          className={`font-black uppercase tracking-[0.3em] text-[0.65rem] py-1 border-b-2 transition-colors ${getPreviewMode(workflow.id) === "structure" ? "text-gray-900 dark:text-white border-emerald-600 dark:border-violet-600" : "text-gray-400 dark:text-gray-600 border-transparent hover:text-gray-700 dark:hover:text-gray-400"}`}
                        >
                          Flow Structure
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewMode(workflow.id, "visual")}
                          className={`font-black uppercase tracking-[0.3em] text-[0.65rem] py-1 border-b-2 transition-colors ${getPreviewMode(workflow.id) === "visual" ? "text-gray-900 dark:text-white border-emerald-600 dark:border-violet-600" : "text-gray-400 dark:text-gray-600 border-transparent hover:text-gray-700 dark:hover:text-gray-400"}`}
                        >
                          Visual Preview
                        </button>
                      </div>
                    </div>

                    {getPreviewMode(workflow.id) === "structure" ? (
                      <div className="flex gap-6 overflow-x-auto pb-10 snap-x snap-mandatory no-scrollbar scroll-smooth">
                        {workflow.nodes.map((node, i) => (
                          <div key={node.id} className="flex-shrink-0 w-80 snap-center">
                            <div className="bg-white dark:bg-[#1a1a24] border border-gray-200 dark:border-white/10 rounded-[2.5rem] p-6 hover:border-emerald-500/40 dark:hover:border-violet-500/40 transition-all duration-700 transform hover:-translate-y-2 group/node">
                              <div className="flex items-center justify-between mb-6">
                                <span className="text-[0.6rem] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">{node.type === 'trigger' ? 'TRIGGER' : `NODE: ${(i).toString().padStart(2, '0')}`}</span>
                                <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-white/10 flex items-center justify-center group-hover/node:rotate-12 transition-transform">
                                  <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-violet-500/70" />
                                </div>
                              </div>
                              <h6 className="text-gray-900 dark:text-white font-black mb-3 truncate pr-4 text-base tracking-tight">{node.name}</h6>
                              <p className="text-gray-500 dark:text-gray-400 text-xs line-clamp-3 mb-6 leading-relaxed font-medium">{node.message}</p>

                              <div className="space-y-2">
                                {workflow.edges.filter(e => e.source === node.id).map((edge) => {
                                  const target = workflow.nodes.find(n => n.id === edge.target);
                                  return (
                                    <div key={edge.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 group/opt">
                                      <span className="text-[0.65rem] font-bold text-gray-500 dark:text-gray-400 truncate group-hover/opt:text-gray-900 dark:group-hover/opt:text-white transition-colors">{target?.name || 'End'}</span>
                                      <ArrowRight className="w-3.5 h-3.5 text-emerald-600/30 dark:text-violet-600/30 group-hover/opt:text-emerald-600 dark:group-hover/opt:text-violet-600 transition-colors" />
                                    </div>
                                  );
                                })}
                                {!workflow.edges.filter(e => e.source === node.id).length && <div className="text-center py-3 text-gray-300 dark:text-gray-700 text-[0.6rem] font-black uppercase tracking-[0.2em]">End of Flow</div>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-y-auto pb-10 max-h-[600px]">
                        <div className="py-4 px-6">
                          {(() => {
                            // Build parent-child and incoming relationships
                            const childrenOf = new Map<string, string[]>();
                            const incomingFor = new Map<string, number>();
                            workflow.nodes.forEach(n => childrenOf.set(n.id, []));
                            workflow.nodes.forEach(n => incomingFor.set(n.id, 0));

                            workflow.edges.forEach(e => {
                              childrenOf.get(e.source)?.push(e.target);
                              incomingFor.set(e.target, (incomingFor.get(e.target) || 0) + 1);
                            });

                            // Find root nodes (no incoming edges)
                            const roots = workflow.nodes.filter(n => (incomingFor.get(n.id) || 0) === 0);

                            // Recursive tree render
                            const renderTree = (nodeId: string, depth: number = 0, isLast: boolean = true): React.ReactNode => {
                              const node = workflow.nodes.find(n => n.id === nodeId);
                              if (!node) return null;

                              const children = childrenOf.get(nodeId) || [];
                              const indent = depth * 2;
                              const isLeaf = children.length === 0;

                              return (
                                <div key={node.id} className="relative">
                                  <div className="flex items-start gap-3" style={{ marginLeft: `${indent * 1.5}rem` }}>
                                    {/* Connection line */}
                                    {depth > 0 && (
                                      <div className="absolute -left-8 top-0 w-8 h-12 pointer-events-none" style={{ marginLeft: `${(indent - 2.5) * 1.5}rem` }}>
                                        <svg className="w-full h-full" viewBox="0 0 32 48" preserveAspectRatio="none">
                                          <line x1="16" y1="0" x2="16" y2="24" stroke="currentColor" strokeWidth="1.5" className="text-gray-300 dark:text-gray-600" />
                                          <line x1="16" y1="24" x2="32" y2="24" stroke="currentColor" strokeWidth="1.5" className="text-gray-300 dark:text-gray-600" />
                                        </svg>
                                      </div>
                                    )}

                                    {/* Node content */}
                                    <div className="flex-1 pt-1">
                                      <div className={`bg-white dark:bg-[#1a1a24] border rounded-2xl p-4 hover:bg-gray-50 dark:hover:bg-[#232332] transition-all ${node.type === 'trigger' ? 'border-amber-500/30' : 'border-emerald-500/30 dark:border-violet-500/30'}`}>
                                        <div className="flex items-start gap-3 mb-2">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${node.type === 'trigger' ? 'bg-amber-500' : 'bg-emerald-600 dark:bg-violet-600'}`}>
                                            {node.type === 'trigger' ? '⚡' : '→'}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="text-[0.65rem] font-black uppercase tracking-widest mb-0.5">
                                              {node.type === 'trigger' ? 'Trigger' : 'Action'}
                                            </div>
                                            <h5 className="text-gray-900 dark:text-white font-bold text-sm truncate">{node.name}</h5>
                                          </div>
                                        </div>
                                        <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed line-clamp-2">{node.message}</p>

                                        {!isLeaf && (
                                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-white/5 flex flex-wrap gap-1.5">
                                            {children.map(childId => {
                                              const child = workflow.nodes.find(n => n.id === childId);
                                              return (
                                                <span key={childId} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 dark:bg-violet-500/10 text-emerald-700 dark:text-violet-300 rounded text-[0.6rem] font-bold truncate">
                                                  → {child?.name || 'Unknown'}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Render children */}
                                  {children.length > 0 && (
                                    <div className="mt-4">
                                      {children.map((childId, idx) => renderTree(childId, depth + 1, idx === children.length - 1))}
                                    </div>
                                  )}
                                </div>
                              );
                            };

                            // Render all root nodes and their descendants
                            if (roots.length === 0) {
                              return <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm font-medium">No nodes found</div>;
                            }

                            return roots.map(root => renderTree(root.id));
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-4 p-8 items-center bg-gray-100 dark:bg-[#0d0d12] rounded-3xl mt-4">
                      <div className="flex items-center gap-4 flex-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/app/workflows/${workflow.id}`)}
                          className="flex items-center gap-3 px-8 py-4 bg-emerald-600 dark:bg-violet-600 hover:bg-emerald-500 dark:hover:bg-violet-500 text-white rounded-3xl transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-600/20 dark:shadow-violet-600/20"
                        >
                          <Edit2 className="w-4 h-4" /> Open Editor
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/app/workflows/${workflow.id}?panel=simulate`)}
                          className="flex items-center gap-3 px-8 py-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-500 dark:text-indigo-300 rounded-3xl transition-all font-black text-xs uppercase tracking-widest"
                        >
                          <Play className="w-4 h-4" /> Simulate
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDuplicate(workflow)}
                          className="flex items-center gap-3 px-8 py-4 bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:hover:bg-white/10 border border-gray-200 dark:border-white/5 text-gray-600 dark:text-gray-400 rounded-3xl transition-all font-black text-xs uppercase tracking-widest"
                        >
                          <Copy className="w-4 h-4" /> Duplicate
                        </button>

                        <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-2" />

                        {workflow.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(workflow.id, workflow.status)}
                            className="flex items-center gap-3 px-8 py-4 bg-amber-500/5 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 rounded-3xl transition-all font-black text-xs uppercase tracking-widest"
                          >
                            <Pause className="w-4 h-4" /> Pause
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(workflow.id, workflow.status)}
                            className="flex items-center gap-3 px-8 py-4 bg-emerald-500/5 dark:bg-violet-500/5 hover:bg-emerald-500/20 dark:hover:bg-violet-500/20 border border-emerald-500/20 dark:border-violet-500/20 text-emerald-500 dark:text-violet-300 rounded-3xl transition-all font-black text-xs uppercase tracking-widest"
                          >
                            <Play className="w-4 h-4" /> Activate
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(workflow.id)}
                          className="w-14 h-14 flex items-center justify-center bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white rounded-3xl transition-all duration-500"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>


      {deleteConfirm && (
        <ConfirmModal
          title="Confirm Deletion"
          message="This workflow will be permanently removed. This action cannot be undone."
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {toast && <ToastNotification message={toast.message} type={toast.type} />}
    </div>
  );
}
