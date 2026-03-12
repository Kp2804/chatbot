import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Save, RefreshCw, Paperclip, Trash2, FileText, CheckCircle, AlertCircle, Loader2, Upload } from "lucide-react";
import { supabase, getAccessToken } from "../../../lib/supabase";

interface Chatbot {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface KBSource {
  id: string;
  title: string;
  source_type: string;
  status: 'active' | 'processing' | 'failed';
  file_size: number | null;
  chunk_count: number | null;
  created_at: string;
}

export function ChatbotManagePage() {
  const navigate = useNavigate();
  const { chatbotId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatbot, setChatbot] = useState<Chatbot | null>(null);
  const [blocked, setBlocked] = useState(false);

  // Knowledge Base state
  const [kbSources, setKbSources] = useState<KBSource[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  useEffect(() => {
    if (window.self !== window.top) {
      setBlocked(true);
      return;
    }

    if (!chatbotId) {
      navigate("/app");
      return;
    }

    localStorage.setItem("activeChatbotId", chatbotId);
    fetchChatbot(chatbotId);
    fetchKBSources(chatbotId);
  }, [chatbotId, navigate]);

  if (blocked) {
    return (
      <div className="h-full flex items-center justify-center bg-[#08080c] text-gray-300 p-6 text-center">
        <div className="max-w-md">
          <h2 className="text-white text-lg font-semibold mb-2">Configuration disabled in embedded mode</h2>
          <p className="text-sm text-gray-400">Manage chatbot settings only on the main chatbot website.</p>
        </div>
      </div>
    );
  }

  const fetchChatbot = async (id: string) => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData.user;
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("chatbots")
        .select("*")
        .eq("id", id)
        .eq("user_id", currentUser.id)
        .single();

      if (error) throw error;
      setChatbot(data as Chatbot);
    } catch (error: any) {
      console.error("Failed loading chatbot:", error.message);
      navigate("/app");
    } finally {
      setLoading(false);
    }
  };

  const fetchKBSources = async (id: string) => {
    try {
      setKbLoading(true);
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setKbSources(data);
      }
    } catch (e) {
      console.error("Failed loading KB sources:", e);
    } finally {
      setKbLoading(false);
    }
  };

  const handlePDFUpload = async (file: File) => {
    if (!chatbotId) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus('error');
      setUploadMessage('File exceeds 5 MB limit.');
      return;
    }

    setUploadStatus('uploading');
    setUploadMessage(`Uploading "${file.name}"…`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chatbotId', chatbotId);
      formData.append('sessionOnly', 'false');

      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setUploadStatus('done');
      setUploadMessage(`"${data.title}" added — ${data.chunkCount} chunks indexed.`);
      fetchKBSources(chatbotId);
    } catch (err: any) {
      setUploadStatus('error');
      setUploadMessage(err.message || 'Upload failed.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadStatus('idle'), 5000);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!chatbotId) return;
    if (!window.confirm('Delete this document and all its indexed chunks?')) return;

    try {
      const token = await getAccessToken();
      const res = await fetch(`${backendUrl}/api/knowledge/source/${sourceId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Delete failed');
      setKbSources(prev => prev.filter(s => s.id !== sourceId));
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  const handleSaveName = async () => {
    if (!chatbotId || !chatbot?.name.trim()) return;

    try {
      setSaving(true);
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData.user;
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      const { error } = await supabase
        .from("chatbots")
        .update({
          name: chatbot.name.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatbotId)
        .eq("user_id", currentUser.id);

      if (error) throw error;
      await fetchChatbot(chatbotId);
    } catch (error: any) {
      console.error("Failed saving chatbot name:", error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !chatbot) {
    return (
      <div className="h-full flex items-center justify-center bg-[#08080c] text-gray-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#08080c]">
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>Manage Chatbot</h1>
            <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>Configure name and knowledge base</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/app/chat/${chatbot.id}`)}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-all"
          >
            Back to Chat
          </button>
        </div>

        {/* Name Section */}
        <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-white" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
            <Bot className="w-4 h-4 text-violet-400" /> Edit Name
          </div>
          <input
            value={chatbot.name}
            onChange={(e) => setChatbot((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            placeholder="Chatbot name"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white"
          />
          <button
            type="button"
            onClick={handleSaveName}
            disabled={saving || !chatbot.name.trim()}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white rounded-xl transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Name"}
          </button>
        </div>

        {/* Knowledge Base Section */}
        <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-5">
          <div className="flex items-center gap-2 text-white" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
            <FileText className="w-4 h-4 text-violet-400" /> Knowledge Base
            <span className="text-gray-500 font-normal text-xs ml-1">— PDFs indexed for RAG responses</span>
          </div>

          {/* Upload zone */}
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
              {uploadStatus === 'uploading'
                ? <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                : <Upload className="w-6 h-6 text-violet-400" />
              }
            </div>
            <div className="text-center">
              <p className="text-white text-sm font-semibold">
                {uploadStatus === 'uploading' ? 'Processing…' : 'Drop a PDF here or click to upload'}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">Max 5 MB · PDF only</p>
            </div>

            {/* Status feedback */}
            {uploadStatus !== 'idle' && uploadStatus !== 'uploading' && (
              <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${
                uploadStatus === 'done'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {uploadStatus === 'done'
                  ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  : <AlertCircle className="w-4 h-4 flex-shrink-0" />
                }
                {uploadMessage}
              </div>
            )}
          </div>

          {/* Indexed documents list */}
          {kbLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading documents…
            </div>
          ) : kbSources.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-4">
              No documents indexed yet. Upload a PDF above to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {kbSources.map((source) => (
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
                      {source.file_size ? ` · ${(source.file_size / 1024).toFixed(0)} KB` : ''}
                      {' · '}{new Date(source.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    source.status === 'active'
                      ? 'bg-green-500/10 text-green-400'
                      : source.status === 'processing'
                        ? 'bg-yellow-500/10 text-yellow-400'
                        : 'bg-red-500/10 text-red-400'
                  }`}>
                    {source.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSource(source.id)}
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
      </div>
    </div>
  );
}
