import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Save, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";

interface Chatbot {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export function ChatbotManagePage() {
  const navigate = useNavigate();
  const { chatbotId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatbot, setChatbot] = useState<Chatbot | null>(null);
  const [blocked, setBlocked] = useState(false);

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
      const { data, error } = await supabase
        .from("chatbots")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setChatbot(data as Chatbot);
    } catch (error: any) {
      console.error("Failed loading chatbot:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!chatbotId || !chatbot?.name.trim()) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from("chatbots")
        .update({
          name: chatbot.name.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatbotId);

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
      <div className="max-w-3xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-white" style={{ fontSize: "2rem", fontWeight: 900 }}>Chatbot Name</h1>
            <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>Only name editing is enabled</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/app/chat/${chatbot.id}`)}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-all"
          >
            Back to Chat
          </button>
        </div>

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
      </div>
    </div>
  );
}
