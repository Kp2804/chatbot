import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp,
  Eye, Star, Download, Upload, HelpCircle, CheckCircle2,
  XCircle, ThumbsUp, ThumbsDown, Copy, X, AlertTriangle,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

interface FAQ {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  tags: string[];
  status: "published" | "draft" | "archived";
  helpful: number;
  not_helpful: number;
  views: number;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

const INITIAL_FAQS: FAQ[] = [];

function StatusBadge({ status }: { status: FAQ["status"] }) {
  if (status === "published") return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-md" style={{ fontSize: "0.68rem" }}>
      <CheckCircle2 className="w-2.5 h-2.5" />Published
    </span>
  );
  if (status === "draft") return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-md" style={{ fontSize: "0.68rem" }}>
      <Edit2 className="w-2.5 h-2.5" />Draft
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-500/15 border border-gray-500/25 text-gray-400 rounded-md" style={{ fontSize: "0.68rem" }}>
      <XCircle className="w-2.5 h-2.5" />Archived
    </span>
  );
}

function renderAnswer(answer: string) {
  return answer.split("\n").map((line, i) => {
    if (line === "") return <br key={i} />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} style={{ marginBottom: "4px" }}>
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={j} className="text-white">{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )}
      </p>
    );
  });
}

function formatDate() {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}


interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-[#1a1a24] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-red-500/15 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-white" style={{ fontSize: "1rem", fontWeight: 700 }}>{title}</h3>
        </div>
        <p className="text-gray-400 mb-5" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/8 text-gray-400 rounded-xl transition-all" style={{ fontSize: "0.875rem" }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl transition-all" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function FAQManager() {
  const navigate = useNavigate();
  const [faqList, setFaqList] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);

  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('faqs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFaqList(data || []);
    } catch (error: any) {
      console.error('Error fetching FAQs:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: "success" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const filtered = faqList.filter((f) => {
    const matchSearch =
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase()) ||
      f.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchSearch;
  });

  const toggleFeatured = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from('faqs')
        .update({ featured: !current })
        .eq('id', id);

      if (error) throw error;
      setFaqList(prev => prev.map(f => f.id === id ? { ...f, featured: !current } : f));
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };

  const deleteFaq = async (id: string) => {
    try {
      const { error } = await supabase
        .from('faqs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setFaqList((prev) => prev.filter((f) => f.id !== id));
      if (expandedId === id) setExpandedId(null);
      setDeleteConfirm(null);
      showToast("FAQ deleted successfully");
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };

  const duplicateFaq = async (faq: FAQ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const dup = {
        user_id: user.id,
        question: `${faq.question} (Copy)`,
        answer: faq.answer,
        tags: faq.tags,
        status: "draft",
        helpful: 0,
        not_helpful: 0,
        views: 0,
        featured: false,
      };

      const { data, error } = await supabase
        .from('faqs')
        .insert([dup])
        .select()
        .single();

      if (error) throw error;
      setFaqList((prev) => [data, ...prev]);
      showToast("FAQ duplicated as draft");
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };


  const handleThumbsUp = async (id: string, current: number) => {
    try {
      const { error } = await supabase
        .from('faqs')
        .update({ helpful: current + 1 })
        .eq('id', id);
      if (error) throw error;
      setFaqList((prev) => prev.map((f) => (f.id === id ? { ...f, helpful: current + 1 } : f)));
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };

  const handleThumbsDown = async (id: string, current: number) => {
    try {
      const { error } = await supabase
        .from('faqs')
        .update({ not_helpful: current + 1 })
        .eq('id', id);
      if (error) throw error;
      setFaqList((prev) => prev.map((f) => (f.id === id ? { ...f, not_helpful: current + 1 } : f)));
    } catch (error: any) {
      showToast(error.message, "info");
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(faqList, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "faqs-export.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${faqList.length} FAQs`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as FAQ[];
        if (!Array.isArray(imported)) throw new Error("Invalid format");
        // Assign new IDs to avoid conflicts
        const now = new Date().toISOString();
        const withNewIds = imported.map((f, i) => ({
          ...f,
          id: `imp_${Date.now()}_${i}`,
          created_at: f.created_at || now,
          updated_at: now,
        }));
        setFaqList((prev) => [...withNewIds, ...prev]);
        showToast(`Imported ${withNewIds.length} FAQs`, "info");
      } catch {
        showToast("Invalid JSON file", "info");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (importRef.current) importRef.current.value = "";
  };

  const publishedCount = faqList.filter((f) => f.status === "published").length;
  const draftCount = faqList.filter((f) => f.status === "draft").length;
  const totalViews = faqList.reduce((sum, f) => sum + f.views, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-2">
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl border ${toast.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-400"
              : "bg-blue-500/15 border-blue-500/25 text-blue-400"
              }`} style={{ fontSize: "0.85rem" }}>
              <CheckCircle2 className="w-4 h-4" />
              {toast.message}
            </div>
          </div>
        )}

        {/* Hidden file input for import */}
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white mb-1" style={{ fontSize: "1.4rem", fontWeight: 700 }}>FAQ Manager</h1>
            <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Manage your knowledge base and frequently asked questions</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/8 text-gray-400 hover:text-white rounded-xl transition-all"
              style={{ fontSize: "0.8rem" }}
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/8 text-gray-400 hover:text-white rounded-xl transition-all"
              style={{ fontSize: "0.8rem" }}
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/faq/new")}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-violet-500/25"
              style={{ fontSize: "0.875rem", fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" /> Add FAQ
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total FAQs", value: faqList.length.toString(), icon: HelpCircle, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "Published", value: publishedCount.toString(), icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Drafts", value: draftCount.toString(), icon: Edit2, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "Total Views", value: totalViews.toLocaleString(), icon: Eye, color: "text-blue-400", bg: "bg-blue-500/10" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 border border-white/8 rounded-xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <div className={stat.color} style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stat.value}</div>
                <div className="text-gray-500" style={{ fontSize: "0.72rem" }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2 mb-5">
          <Search className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search questions, answers, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-gray-400 placeholder-gray-600 focus:outline-none flex-1"
            style={{ fontSize: "0.8rem" }}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-gray-600 hover:text-gray-400 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>


        {/* Results Count */}
        <div className="mb-3">
          <span className="text-gray-600" style={{ fontSize: "0.78rem" }}>
            Showing {filtered.length} {filtered.length === 1 ? "result" : "results"}
            {search && ` for "${search}"`}
          </span>
        </div>

        {/* FAQ List */}
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p style={{ fontSize: "0.9rem" }}>No FAQs found</p>
              <p style={{ fontSize: "0.78rem" }}>Try adjusting your search or filter</p>
            </div>
          ) : (
            filtered.map((faq) => (
              <div key={faq.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden hover:border-white/15 transition-all">
                {/* Question Row */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-violet-400 transition-colors mt-0.5"
                    >
                      {expandedId === faq.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        {faq.featured && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 rounded-md" style={{ fontSize: "0.6rem" }}>
                            <Star className="w-2.5 h-2.5 fill-yellow-400" />Featured
                          </span>
                        )}
                        <StatusBadge status={faq.status} />
                      </div>
                      <p className="text-white" style={{ fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.4 }}>
                        {faq.question}
                      </p>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="flex items-center gap-1 text-gray-600" style={{ fontSize: "0.7rem" }}>
                          <Eye className="w-3 h-3" />{faq.views.toLocaleString()} views
                        </span>
                        <span className="flex items-center gap-1 text-emerald-500" style={{ fontSize: "0.7rem" }}>
                          <ThumbsUp className="w-3 h-3" />{faq.helpful}
                        </span>
                        <span className="flex items-center gap-1 text-red-500" style={{ fontSize: "0.7rem" }}>
                          <ThumbsDown className="w-3 h-3" />{faq.not_helpful}
                        </span>
                        <span className="text-gray-700" style={{ fontSize: "0.68rem" }}>Updated {new Date(faq.updated_at).toLocaleDateString()}</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {faq.tags.map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 bg-violet-500/10 text-violet-500 rounded-md" style={{ fontSize: "0.62rem" }}>#{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleFeatured(faq.id, faq.featured)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${faq.featured ? "text-yellow-400 bg-yellow-400/10" : "text-gray-600 hover:text-yellow-400 hover:bg-yellow-400/10"
                          }`}
                        title={faq.featured ? "Remove from featured" : "Mark as featured"}
                      >
                        <Star className={`w-3.5 h-3.5 ${faq.featured ? "fill-yellow-400" : ""}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/app/faq/${faq.id}`)}
                        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
                        title="Edit FAQ"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateFaq(faq)}
                        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                        title="Duplicate FAQ"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(faq.id)}
                        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Delete FAQ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Answer */}
                {expandedId === faq.id && (
                  <div className="border-t border-white/8 px-12 py-4 bg-black/20">
                    <div className="text-gray-300" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
                      {renderAnswer(faq.answer)}
                    </div>
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/8">
                      <span className="text-gray-600" style={{ fontSize: "0.72rem" }}>Was this helpful?</span>
                      <button
                        type="button"
                        onClick={() => handleThumbsUp(faq.id, faq.helpful)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg transition-all"
                        style={{ fontSize: "0.72rem" }}
                      >
                        <ThumbsUp className="w-3 h-3" /> Yes ({faq.helpful})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleThumbsDown(faq.id, faq.not_helpful)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-all"
                        style={{ fontSize: "0.72rem" }}
                      >
                        <ThumbsDown className="w-3 h-3" /> No ({faq.not_helpful})
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/app/faq/${faq.id}`)}
                        className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-400 rounded-lg transition-all"
                        style={{ fontSize: "0.72rem" }}
                      >
                        <Edit2 className="w-3 h-3" /> Edit Answer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>


      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete FAQ"
          message="Are you sure you want to delete this FAQ? This action cannot be undone."
          onConfirm={() => deleteFaq(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
