import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import {
  BookOpen, FileText, Trash2, Upload, Loader2,
  CheckCircle, AlertCircle, Bot
} from "lucide-react";
import { supabase, getAccessToken } from "../../../lib/supabase";

interface KBSource {
  id: string;
  title: string;
  source_type: string;
  status: "active" | "processing" | "failed";
  file_size: number | null;
  chunk_count: number | null;
  created_at: string;
}

interface Chatbot {
  id: string;
  name: string;
}

export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState<string>("");
  const [sources, setSources] = useState<KBSource[]>([]);
  const [loadingChatbots, setLoadingChatbots] = useState(true);
  const [loadingSources, setLoadingSources] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load chatbots for the logged-in user
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const { data, error } = await supabase
        .from("chatbots")
        .select("id, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setChatbots(data);
        // Pre-select the active chatbot if set
        const active = localStorage.getItem("activeChatbotId");
        if (active && data.find((c: Chatbot) => c.id === active)) {
          setSelectedChatbotId(active);
        } else if (data.length > 0) {
          setSelectedChatbotId(data[0].id);
        }
      }
      setLoadingChatbots(false);
    };
    load();
  }, [navigate]);

  // Load sources whenever selected chatbot changes
  useEffect(() => {
    if (!selectedChatbotId) { setSources([]); return; }
    fetchSources(selectedChatbotId);
  }, [selectedChatbotId]);

  const fetchSources = async (chatbotId: string) => {
    setLoadingSources(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/${chatbotId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setSources(await res.json());
    } catch {
      // silent
    } finally {
      setLoadingSources(false);
    }
  };

  const handlePDFUpload = async (file: File) => {
    if (!selectedChatbotId) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus("error");
      setUploadMessage("File exceeds 5 MB limit.");
      setTimeout(() => setUploadStatus("idle"), 4000);
      return;
    }

    setUploadStatus("uploading");
    setUploadMessage(`Uploading "${file.name}"…`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("chatbotId", selectedChatbotId);
      formData.append("sessionOnly", "false");

      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadStatus("done");
      setUploadMessage(`"${data.title}" indexed — ${data.chunkCount} chunks`);
      fetchSources(selectedChatbotId);
    } catch (err: any) {
      setUploadStatus("error");
      setUploadMessage(err.message || "Upload failed.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setUploadStatus("idle"), 5000);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!window.confirm("Delete this document and all its indexed chunks?")) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/source/${sourceId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Delete failed");
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (err: any) {
      alert(err.message || "Delete failed");
    }
  };

  if (loadingChatbots) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-[#08080c]">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-[#08080c]">
      <div className="max-w-3xl mx-auto p-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-violet-400" />
            </div>
            <h1 className="text-black dark:text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>
              Knowledge Base
            </h1>
          </div>
          <p className="text-gray-500 text-sm ml-[52px]">
            Upload PDFs to give your chatbots knowledge for accurate, grounded answers.
          </p>
        </div>

        {/* Chatbot Selector */}
        {chatbots.length === 0 ? (
          <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/10 rounded-2xl p-8 text-center">
            <Bot className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No chatbots found. Create a chatbot first.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <label className="text-black dark:text-white text-sm font-semibold whitespace-nowrap">Chatbot:</label>
              <select
                value={selectedChatbotId}
                onChange={(e) => setSelectedChatbotId(e.target.value)}
                className="flex-1 bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-3 py-2 text-black dark:text-white text-sm focus:outline-none focus:border-violet-500/50"
              >
                {chatbots.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-[#16161e]">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Upload Zone */}
            <div
              className="border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-violet-500/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group"
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
              <div className="w-14 h-14 bg-violet-500/10 group-hover:bg-violet-500/20 rounded-2xl flex items-center justify-center transition-all">
                {uploadStatus === "uploading"
                  ? <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
                  : <Upload className="w-7 h-7 text-violet-400" />
                }
              </div>
              <div className="text-center">
                <p className="text-black dark:text-white font-semibold">
                  {uploadStatus === "uploading" ? "Processing…" : "Drop a PDF here or click to upload"}
                </p>
                <p className="text-gray-500 text-xs mt-1">Max 5 MB · PDF only · Isolated per chatbot</p>
              </div>

              {uploadStatus !== "idle" && uploadStatus !== "uploading" && (
                <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl ${
                  uploadStatus === "done"
                    ? "bg-green-500/10 text-green-500 dark:text-green-400"
                    : "bg-red-500/10 text-red-500 dark:text-red-400"
                }`}>
                  {uploadStatus === "done"
                    ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    : <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  }
                  {uploadMessage}
                </div>
              )}
            </div>

            {/* Documents list */}
            <div>
              <h2 className="text-black dark:text-white font-semibold text-sm mb-3">
                Indexed Documents
                {sources.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500 font-normal">{sources.length} document{sources.length !== 1 ? "s" : ""}</span>
                )}
              </h2>

              {loadingSources ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : sources.length === 0 ? (
                <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/8 rounded-2xl p-8 text-center">
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No documents yet for this chatbot.</p>
                  <p className="text-gray-600 text-xs mt-1">Upload a PDF above to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      className="flex items-center gap-3 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/8 rounded-xl px-4 py-3"
                    >
                      <div className="w-9 h-9 bg-violet-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-black dark:text-white text-sm font-medium truncate">{source.title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {source.chunk_count ?? 0} chunks
                          {source.file_size ? ` · ${(source.file_size / 1024).toFixed(0)} KB` : ""}
                          {" · "}{new Date(source.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        source.status === "active"
                          ? "bg-green-500/10 text-green-500 dark:text-green-400"
                          : source.status === "processing"
                            ? "bg-yellow-500/10 text-yellow-500 dark:text-yellow-400"
                            : "bg-red-500/10 text-red-400"
                      }`}>
                        {source.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(source.id)}
                        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
