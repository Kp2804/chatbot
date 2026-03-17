import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  ExternalLink,
  Globe2,
  Link2,
  Loader2,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  ShieldCheck,
  Upload,
  Trash2,
} from "lucide-react";
import { getAccessToken } from "../../../lib/supabase";

type WebsiteScope = "single_page" | "linked_pages" | "full_domain" | "specific_paths_only";
type SyncFrequency = "manual" | "weekly" | "monthly";

interface WebsiteRules {
  includePaths: string[];
  excludePaths: string[];
  maxPages: number;
  crawlDepth: number;
  ignoreQueryParams: boolean;
  followExternalLinks: boolean;
  strictSourceMode: boolean;
  autoResyncFrequency: SyncFrequency;
}

interface PreviewTotals {
  pagesDiscovered: number;
  pagesSelected: number;
  pagesExcluded: number;
  pagesSkipped: number;
  failedPages: number;
  estimatedContentSize: number;
}

interface PreviewResponse {
  rules: WebsiteRules;
  pages: Array<{
    url: string;
    normalizedUrl: string;
    title: string;
    status: string;
    contentSize: number;
    warning?: string;
  }>;
  totals: PreviewTotals;
  warnings: Array<{ type: string; url: string; message: string }>;
}

interface IndexResponse {
  success: boolean;
  stages: string[];
  summary: SummaryStats;
  preview: PreviewTotals;
  pageResults: Array<IndexedPage>;
}

interface SummaryStats {
  totalIndexedPages: number;
  totalChunks: number;
  pagesSkipped: number;
  failedPages: number;
  lastSynced: string;
}

interface KnowledgeSource {
  id: string;
  chatbot_id: string;
  source_type: string;
  title: string;
  content: string | null;
  status: "active" | "processing" | "failed";
  chunk_count: number | null;
  file_size: number | null;
  metadata?: any;
  last_synced_at?: string;
  created_at: string;
  priority?: boolean;
}

interface IndexedPage {
  sourceId: string;
  title: string;
  url: string;
  status: string;
  chunkCount: number;
  lastIndexed: string;
}

interface TestResponse {
  answer: string;
  citations: Array<{ sourceId: string; title: string; url: string | null; similarity: number }>;
}

const STAGES = [
  "discovering pages",
  "fetching content",
  "extracting clean text",
  "removing duplicates",
  "chunking content",
  "indexing complete",
];

const scopeOptions: Array<{ value: WebsiteScope; label: string; desc: string }> = [
  { value: "single_page", label: "Single page", desc: "Only this URL" },
  { value: "linked_pages", label: "This page + linked", desc: "Follow links up to depth" },
  { value: "full_domain", label: "Full domain", desc: "Everything on this domain" },
  { value: "specific_paths_only", label: "Specific paths", desc: "Only chosen folders" },
];

export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"documents" | "website">("website");
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<WebsiteScope>("linked_pages");
  const [rules, setRules] = useState<WebsiteRules>({
    includePaths: [],
    excludePaths: [],
    maxPages: 25,
    crawlDepth: 2,
    ignoreQueryParams: true,
    followExternalLinks: false,
    strictSourceMode: false,
    autoResyncFrequency: "manual",
  });

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [indexing, setIndexing] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [stagePointer, setStagePointer] = useState(0);
  const progressTimer = useRef<NodeJS.Timeout | null>(null);

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PDF upload state
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [summary, setSummary] = useState<SummaryStats | null>(null);

  const [testQuestion, setTestQuestion] = useState("What does the website say about pricing?");
  const [testAnswer, setTestAnswer] = useState<TestResponse | null>(null);
  const [testing, setTesting] = useState(false);
  const [clearingWebsiteMemory, setClearingWebsiteMemory] = useState(false);

  const readJsonSafely = async (res: Response) => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const activeId = localStorage.getItem("activeChatbotId");
    if (!activeId) {
      navigate("/app");
      return;
    }
    setChatbotId(activeId);
    fetchSources(activeId);
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const formattedSummary = useMemo(() => {
    if (summary) return summary;
    const totalIndexedPages = sources.filter((s) => s.source_type === "website").length;
    const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count || 0), 0);
    const lastSynced = sources
      .map((s) => s.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop();
    return {
      totalIndexedPages,
      totalChunks,
      pagesSkipped: preview?.totals.pagesSkipped || 0,
      failedPages: preview?.totals.failedPages || 0,
      lastSynced: lastSynced || "",
    } as SummaryStats;
  }, [sources, preview, summary]);

  const handlePreview = async () => {
    if (!chatbotId || !url.trim()) return;
    setError(null);
    setPreviewLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/website/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ chatbotId, url: url.trim(), scope, rules }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) throw new Error(data?.error || "Preview failed");
      setPreview(data);
    } catch (err: any) {
      setError(err.message || "Preview failed");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleIndex = async () => {
    if (!chatbotId || !url.trim()) return;
    if (websiteLock.activeHost && websiteLock.requestedHost && websiteLock.hasConflict) {
      setError(
        `This chatbot already has indexed website memory for "${websiteLock.activeHost}". Clear existing website memory before indexing another website.`
      );
      return;
    }
    setError(null);
    setIndexing("running");
    setStagePointer(0);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setStagePointer((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 1200);

    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/website/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ chatbotId, url: url.trim(), scope, rules }),
      });
      const data = (await readJsonSafely(res)) as IndexResponse | null;
      if (!res.ok || !data?.success) throw new Error((data as any)?.error || "Indexing failed");

      setSummary(data.summary);
      setPreview((prevPreview) =>
        prevPreview
          ? { ...prevPreview, totals: data.preview }
          : ({ rules, pages: [], totals: data.preview, warnings: [] } as PreviewResponse)
      );
      setStagePointer(STAGES.length - 1);
      setIndexing("done");
      fetchSources(chatbotId);
    } catch (err: any) {
      setIndexing("failed");
      setError(err.message || "Indexing failed");
    } finally {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }
  };

  const fetchSources = async (id: string) => {
    try {
      setSourcesLoading(true);
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load sources");
      const data = (await readJsonSafely(res)) as KnowledgeSource[] | null;
      if (!Array.isArray(data)) throw new Error("Failed to parse sources");
      setSources(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSourcesLoading(false);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!chatbotId) return;
    const confirmed = window.confirm("Remove this indexed page and its chunks?");
    if (!confirmed) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/source/${sourceId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Delete failed");
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      setSummary(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleClearWebsiteMemory = async () => {
    if (!chatbotId) return;
    const confirmed = window.confirm(
      "Clear all indexed website data for this chatbot? This removes every indexed page and all related chunks."
    );
    if (!confirmed) return;

    setClearingWebsiteMemory(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/website/chatbot/${chatbotId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        // Backward-compatible fallback: if route is missing, delete each website source.
        if (res.status === 404 || res.status === 405) {
          for (const source of websiteSources) {
            const delRes = await fetch(`${backendUrl}/api/knowledge/source/${source.id}`, {
              method: "DELETE",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!delRes.ok) {
              const delData = await readJsonSafely(delRes);
              throw new Error(delData?.error || "Failed to clear website memory");
            }
          }
        } else {
          throw new Error(data?.error || "Failed to clear website memory. Please restart backend and try again.");
        }
      }

      setSources((prev) => prev.filter((s) => s.source_type !== "website"));
      setSummary(null);
      setPreview(null);
      setIndexing("idle");
      setStagePointer(0);
    } catch (err: any) {
      setError(err.message || "Failed to clear website memory");
    } finally {
      setClearingWebsiteMemory(false);
    }
  };

  const handleReindex = async (sourceId: string) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/website/source/${sourceId}/reindex`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await readJsonSafely(res);
      if (!res.ok) throw new Error(data.error || "Reindex failed");
      fetchSources(chatbotId!);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePriorityToggle = async (sourceId: string, current: boolean) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/website/source/${sourceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ priority: !current }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) throw new Error(data.error || "Update failed");
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, priority: !current, metadata: { ...(s.metadata || {}), priority: !current } } : s)));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async () => {
    if (!chatbotId || !testQuestion.trim()) return;
    setTesting(true);
    setTestAnswer(null);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/website/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ chatbotId, question: testQuestion.trim() }),
      });
      const data = (await readJsonSafely(res)) as TestResponse | null;
      if (!res.ok || !data) throw new Error((data as any)?.error || "Test failed");
      setTestAnswer(data);
    } catch (err: any) {
      setError(err.message || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handlePDFUpload = async (file: File) => {
    if (!chatbotId) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus("error");
      setUploadMessage("File exceeds 5 MB limit.");
      return;
    }

    setUploadStatus("uploading");
    setUploadMessage(`Uploading "${file.name}"…`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("chatbotId", chatbotId);
      formData.append("sessionOnly", "false");

      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await readJsonSafely(res);
      if (!res.ok) throw new Error(data?.error || "Upload failed");

      setUploadStatus("done");
      setUploadMessage(`"${data.title}" added — ${data.chunkCount} chunks indexed.`);
      fetchSources(chatbotId);
    } catch (err: any) {
      setUploadStatus("error");
      setUploadMessage(err.message || "Upload failed.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setUploadStatus("idle"), 4000);
    }
  };

  const handlePathsChange = (value: string, key: "includePaths" | "excludePaths") => {
    const items = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    setRules((prev) => ({ ...prev, [key]: items }));
  };

  const renderStat = (label: string, value: string | number, highlight?: boolean) => (
    <div className="flex flex-col gap-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 min-w-[160px]">
      <span className="text-gray-500 text-xs uppercase tracking-[0.08em]">{label}</span>
      <span className={`text-white text-lg font-bold ${highlight ? "text-violet-300" : ""}`}>{value}</span>
    </div>
  );

  const formatBytes = (val: number) => {
    if (!val) return "0 KB";
    if (val > 1_000_000) return `${(val / 1_000_000).toFixed(1)} MB`;
    if (val > 1_000) return `${(val / 1_000).toFixed(0)} KB`;
    return `${val} B`;
  };

  const websiteSources = sources.filter((s) => s.source_type === "website");
  const pdfSources = sources.filter((s) => s.source_type === "pdf");
  const websiteLock = useMemo(() => {
    const normalizeHost = (raw?: string | null) => {
      if (!raw) return null;
      try {
        const parsed = new URL(raw);
        return parsed.hostname.replace(/^www\./i, "").toLowerCase();
      } catch {
        return null;
      }
    };
    const isSameWebsiteHost = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

    const activeHost = normalizeHost(websiteSources[0]?.content || websiteSources[0]?.metadata?.url) || null;
    const requestedHost = normalizeHost(url.trim()) || null;
    const hasConflict = !!activeHost && !!requestedHost && !isSameWebsiteHost(activeHost, requestedHost);

    return { activeHost, requestedHost, hasConflict };
  }, [websiteSources, url]);

  return (
    <div className="h-full overflow-y-auto bg-[#08080c]">
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-[0.2em]">Knowledge Base</p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>
                {view === "website" ? "Train From Website" : "Upload Documents"}
              </h1>
              <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
                {view === "website"
                  ? "Paste your website and automatically turn its content into chatbot knowledge. Content stays isolated to this chatbot."
                  : "Upload PDFs and keep them isolated to this chatbot’s knowledge base."}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3 text-gray-400 text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Data remains scoped to your selected chatbot
            </div>
          </div>
          <div className="mt-3 inline-flex bg-white/5 border border-white/10 rounded-2xl p-1 w-max">
            <button
              type="button"
              onClick={() => setView("website")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                view === "website" ? "bg-white text-black" : "text-gray-400 hover:text-white"
              }`}
            >
              Train From Website
            </button>
            <button
              type="button"
              onClick={() => setView("documents")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                view === "documents" ? "bg-white text-black" : "text-gray-400 hover:text-white"
              }`}
            >
              Upload PDFs
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Something went wrong</p>
              <p className="text-sm text-red-100/80">{error}</p>
            </div>
          </div>
        )}

        {view === "website" ? (
          <>
            {/* URL Input Card */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-500/15 rounded-2xl flex items-center justify-center">
                    <Globe2 className="w-5 h-5 text-violet-300" />
                  </div>
                  <div>
                    <p className="text-white font-semibold">Website to index</p>
                    <p className="text-gray-500 text-sm">We’ll crawl, clean, deduplicate, and chunk content for this chatbot only.</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Isolation by chatbot
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs text-gray-400">Website URL</label>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Crawl scope</label>
                  <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 flex items-center justify-between text-white">
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value as WebsiteScope)}
                      className="bg-transparent w-full focus:outline-none text-sm"
                    >
                      {scopeOptions.map((option) => (
                        <option key={option.value} value={option.value} className="bg-[#0f0f13] text-white">
                          {option.label} — {option.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewLoading || !url.trim()}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Preview crawl
                </button>
                <button
                  type="button"
                  onClick={handleIndex}
                  disabled={indexing === "running" || !url.trim() || websiteLock.hasConflict}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white rounded-xl transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {indexing === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {indexing === "running" ? "Indexing…" : "Start Indexing"}
                </button>
                <p className="text-gray-500 text-xs">
                  {websiteLock.hasConflict
                    ? `Locked to ${websiteLock.activeHost}. Clear website memory to index another site.`
                    : "We’ll only index for this chatbot. You can reindex or remove later."}
                </p>
              </div>
            </div>

            {/* Crawl Settings */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Link2 className="w-4 h-4 text-violet-300" /> Crawl settings
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Include paths (comma separated)</label>
                  <input
                    placeholder="/blog, /docs"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-gray-600"
                    onChange={(e) => handlePathsChange(e.target.value, "includePaths")}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Exclude paths (comma separated)</label>
                  <input
                    placeholder="/admin, /private"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-gray-600"
                    onChange={(e) => handlePathsChange(e.target.value, "excludePaths")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Max pages</label>
                  <input
                    type="number"
                    min={1}
                    max={250}
                    value={rules.maxPages}
                    onChange={(e) => setRules((prev) => ({ ...prev, maxPages: Number(e.target.value) }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Crawl depth</label>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={rules.crawlDepth}
                    onChange={(e) => setRules((prev) => ({ ...prev, crawlDepth: Number(e.target.value) }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Ignore query params</label>
                  <button
                    type="button"
                    onClick={() => setRules((prev) => ({ ...prev, ignoreQueryParams: !prev.ignoreQueryParams }))}
                    className={`w-full px-3 py-2.5 rounded-xl border ${rules.ignoreQueryParams ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white"}`}
                  >
                    {rules.ignoreQueryParams ? "On" : "Off"}
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Follow external links</label>
                  <button
                    type="button"
                    onClick={() => setRules((prev) => ({ ...prev, followExternalLinks: !prev.followExternalLinks }))}
                    className={`w-full px-3 py-2.5 rounded-xl border ${rules.followExternalLinks ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white"}`}
                  >
                    {rules.followExternalLinks ? "On" : "Off (recommended)"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Strict source mode</label>
                  <button
                    type="button"
                    onClick={() => setRules((prev) => ({ ...prev, strictSourceMode: !prev.strictSourceMode }))}
                    className={`w-full px-3 py-2.5 rounded-xl border ${rules.strictSourceMode ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white"}`}
                  >
                    {rules.strictSourceMode ? "Enabled" : "Disabled"}
                  </button>
                  <p className="text-gray-500 text-xs">Keep answers pinned to indexed text only.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Auto re-sync</label>
                  <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white">
                    <select
                      value={rules.autoResyncFrequency}
                      onChange={(e) => setRules((prev) => ({ ...prev, autoResyncFrequency: e.target.value as SyncFrequency }))}
                      className="bg-transparent w-full focus:outline-none text-sm"
                    >
                      <option className="bg-[#0f0f13]" value="manual">Manual</option>
                      <option className="bg-[#0f0f13]" value="weekly">Weekly</option>
                      <option className="bg-[#0f0f13]" value="monthly">Monthly</option>
                    </select>
                  </div>
                  <p className="text-gray-500 text-xs">Future-friendly: schedule refreshes per chatbot.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">Max content estimate</label>
                  <div className="px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm">
                    {preview ? formatBytes(preview.totals.estimatedContentSize) : "–"}
                  </div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold">
                <RefreshCw className="w-4 h-4 text-violet-300" /> Preview before indexing
              </div>
              {preview ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {renderStat("Pages discovered", preview.totals.pagesDiscovered)}
                  {renderStat("Pages selected", preview.totals.pagesSelected, true)}
                  {renderStat("Pages excluded", preview.totals.pagesExcluded)}
                  {renderStat("Est. size", formatBytes(preview.totals.estimatedContentSize))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Run a preview to see what will be indexed.</p>
              )}

              {preview?.warnings?.length ? (
                <div className="space-y-2">
                  <p className="text-gray-400 text-sm">Warnings</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {preview.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 text-amber-100 px-3 py-2 rounded-xl">
                        <AlertCircle className="w-4 h-4 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-semibold capitalize">{w.type}</p>
                          <p className="text-amber-100/80 text-xs">{w.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Progress */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Loader2 className="w-4 h-4 text-violet-300" /> Live indexing progress
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {STAGES.map((stage, idx) => {
                  const status = idx < stagePointer ? "done" : idx === stagePointer && indexing === "running" ? "active" : idx <= stagePointer && indexing === "done" ? "done" : "idle";
                  const color = status === "done" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-100" : status === "active" ? "bg-violet-500/15 border-violet-500/30 text-violet-100" : "bg-white/5 border-white/10 text-gray-400";
                  return (
                    <div key={stage} className={`flex items-center gap-3 px-3 py-3 rounded-xl border ${color}`}>
                      {status === "done" ? <CheckCircle2 className="w-4 h-4" /> : status === "active" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      <span className="text-sm capitalize">{stage}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Indexed pages table */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <ShieldCheck className="w-4 h-4 text-violet-300" /> Indexed website pages
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">Per-chatbot isolation is enforced.</span>
                  <button
                    type="button"
                    onClick={handleClearWebsiteMemory}
                    disabled={clearingWebsiteMemory || websiteSources.length === 0}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-200 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed text-xs font-semibold flex items-center gap-2"
                    title="Clear all indexed website pages and chunks"
                  >
                    {clearingWebsiteMemory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Clear website memory
                  </button>
                </div>
              </div>

              {sourcesLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading indexed pages…</div>
              ) : websiteSources.length === 0 ? (
                <p className="text-gray-500 text-sm">No website pages indexed yet. Run indexing to populate this table.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead className="text-gray-500">
                      <tr>
                        <th className="py-2 pr-4">Title</th>
                        <th className="py-2 pr-4">URL</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Chunks</th>
                        <th className="py-2 pr-4">Last indexed</th>
                        <th className="py-2 pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {websiteSources.map((source) => (
                        <tr key={source.id} className="text-white/90">
                          <td className="py-3 pr-4 font-semibold">{source.title || "Untitled page"}</td>
                          <td className="py-3 pr-4 text-violet-200 flex items-center gap-2">
                            <a href={source.content || source.metadata?.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {(source.content || source.metadata?.url || "").replace(/https?:\/\//, "")}
                            </a>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              source.status === "active"
                                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                                : source.status === "processing"
                                  ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                                  : "bg-red-500/15 text-red-200 border border-red-500/30"
                            }`}>
                              {source.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{source.chunk_count ?? 0}</td>
                          <td className="py-3 pr-4">{source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : "–"}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2 text-gray-400">
                              <button
                                className="px-2 py-1 rounded-lg border border-white/10 hover:border-violet-500/40 hover:text-white"
                                onClick={() => handleReindex(source.id)}
                              >
                                Reindex
                              </button>
                              <button
                                className="px-2 py-1 rounded-lg border border-white/10 hover:border-violet-500/40 hover:text-white flex items-center gap-1"
                                onClick={() => handlePriorityToggle(source.id, !!source.priority || !!source.metadata?.priority)}
                              >
                                {(source.priority || source.metadata?.priority) ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                                {(source.priority || source.metadata?.priority) ? "Pinned" : "Pin"}
                              </button>
                              <button
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/15 text-red-300"
                                onClick={() => handleDelete(source.id)}
                                title="Remove"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Test retrieval */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Play className="w-4 h-4 text-violet-300" /> Test retrieval
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <input
                    value={testQuestion}
                    onChange={(e) => setTestQuestion(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white"
                    placeholder="Ask a question using your indexed site"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !testQuestion.trim()}
                  className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run test
                </button>
              </div>
              {testAnswer && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <p className="text-white text-sm leading-relaxed">{testAnswer.answer}</p>
                  {testAnswer.citations.length > 0 && (
                    <div className="text-xs text-gray-400 flex flex-wrap gap-3">
                      {testAnswer.citations.map((c) => (
                        <span key={c.sourceId} className="px-2 py-1 rounded-lg bg-violet-500/10 text-violet-100 border border-violet-500/20">
                          {c.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShieldCheck className="w-4 h-4 text-violet-300" /> Sync & health summary
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {renderStat("Indexed pages", formattedSummary.totalIndexedPages || 0, true)}
                {renderStat("Chunks", formattedSummary.totalChunks || 0)}
                {renderStat("Pages skipped", formattedSummary.pagesSkipped || 0)}
                {renderStat("Failed pages", formattedSummary.failedPages || 0)}
                {renderStat("Last synced", formattedSummary.lastSynced ? new Date(formattedSummary.lastSynced).toLocaleString() : "–")}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* PDF Upload Section */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-500/15 rounded-2xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <p className="text-white font-semibold">Upload PDFs</p>
                  <p className="text-gray-500 text-sm">Drop or select PDFs to add to this chatbot’s knowledge base.</p>
                </div>
              </div>

              <div
                className="border-2 border-dashed border-white/10 hover:border-violet-500/50 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handlePDFUpload(file);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePDFUpload(file);
                  }}
                />
                <div className="w-12 h-12 bg-violet-500/10 group-hover:bg-violet-500/20 rounded-xl flex items-center justify-center transition-all">
                  {uploadStatus === "uploading"
                    ? <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                    : <Upload className="w-6 h-6 text-violet-400" />
                  }
                </div>
                <div className="text-center">
                  <p className="text-white text-sm font-semibold">
                    {uploadStatus === "uploading" ? "Processing…" : "Drop a PDF here or click to upload"}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">Max 5 MB · PDF only</p>
                </div>

                {uploadStatus !== "idle" && uploadStatus !== "uploading" && (
                  <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${
                    uploadStatus === "done"
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    {uploadStatus === "done"
                      ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    }
                    {uploadMessage}
                  </div>
                )}
              </div>

              {sourcesLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading documents…</div>
              ) : pdfSources.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">
                  No documents indexed yet. Upload a PDF above to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {pdfSources.map((source) => (
                    <div
                      key={source.id}
                      className="flex items-center gap-3 bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3"
                    >
                      <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{source.title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {source.chunk_count ?? 0} chunks
                          {source.file_size ? ` · ${(source.file_size / 1024).toFixed(0)} KB` : ""}
                          {" · "}{new Date(source.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        source.status === "active"
                          ? "bg-green-500/10 text-green-400"
                          : source.status === "processing"
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-red-500/10 text-red-400"
                      }`}>
                        {source.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(source.id)}
                        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary for documents */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShieldCheck className="w-4 h-4 text-violet-300" /> Knowledge health
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {renderStat("PDFs indexed", pdfSources.length, true)}
                {renderStat("Chunks", pdfSources.reduce((sum, s) => sum + (s.chunk_count || 0), 0))}
                {renderStat("Last synced", formattedSummary.lastSynced ? new Date(formattedSummary.lastSynced).toLocaleString() : "–")}
                {renderStat("Website pages", websiteSources.length)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
