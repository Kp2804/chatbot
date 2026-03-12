import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bot, Plus, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";

interface Chatbot {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export function ChatbotSelectionPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChatbotName, setNewChatbotName] = useState("");
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);

  useEffect(() => {
    fetchChatbots();
  }, []);

  const fetchChatbots = async () => {
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
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const list = data || [];
      if (list.length === 0) {
        const { data: created, error: createError } = await supabase
          .from("chatbots")
          .insert([
            {
              user_id: currentUser.id,
              name: "My Chatbot",
              description: "Default chatbot",
            },
          ])
          .select()
          .single();

        if (createError) throw createError;
        setChatbots([created]);
        return;
      }

      setChatbots(list);
    } catch (error: any) {
      console.error("Error fetching chatbots:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChatbot = async () => {
    const trimmedName = newChatbotName.trim();
    if (!trimmedName) return;

    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user;
    if (!currentUser) return;

    setCreating(true);

    const { data, error } = await supabase
      .from("chatbots")
      .insert([
        {
          user_id: currentUser.id,
          name: trimmedName,
          description: "",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating chatbot:", error.message);
      setCreating(false);
      return;
    }

    setChatbots((prev) => [...prev, data]);
    setNewChatbotName("");
    setShowCreateModal(false);
    setCreating(false);
  };

  const handleSelectChatbot = (chatbotId: string) => {
    localStorage.setItem("activeChatbotId", chatbotId);
    navigate(`/app/chat/${chatbotId}`);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#08080c]">
      <div className="max-w-5xl mx-auto p-10">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-white mb-2 leading-none" style={{ fontSize: "2.3rem", fontWeight: 900, letterSpacing: "-0.03em" }}>
              Select Chatbot
            </h1>
            <p className="text-gray-500 font-bold uppercase tracking-[0.2em]" style={{ fontSize: "0.7rem" }}>
              Choose a chatbot to open conversations
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewChatbotName(`Chatbot ${chatbots.length + 1}`);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white rounded-2xl transition-all shadow-lg shadow-violet-500/25"
            style={{ fontSize: "0.85rem", fontWeight: 700 }}
          >
            <Plus className="w-4 h-4" /> Create Chatbot
          </button>
        </div>

        {loading ? (
          <div className="h-72 flex items-center justify-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {chatbots.map((bot) => (
              <button
                key={bot.id}
                type="button"
                onClick={() => handleSelectChatbot(bot.id)}
                className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 hover:border-violet-500/40 rounded-[1.8rem] p-6 text-left transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-violet-500/15 rounded-2xl flex items-center justify-center">
                    <Bot className="w-6 h-6 text-violet-400" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-violet-400 transition-colors" />
                </div>
                <h3 className="text-white mb-2" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{bot.name}</h3>
                <p className="text-gray-500" style={{ fontSize: "0.8rem" }}>
                  {bot.description?.trim() || "No description configured"}
                </p>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      localStorage.setItem("activeChatbotId", bot.id);
                      navigate(`/app/chat/${bot.id}/manage`);
                    }}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-lg"
                    style={{ fontSize: "0.72rem", fontWeight: 600 }}
                  >
                    Manage
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}

        {showCreateModal && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !creating) setShowCreateModal(false);
            }}
          >
            <div className="w-full max-w-md bg-[#15151f] border border-white/10 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 bg-violet-500/15 rounded-xl flex items-center justify-center">
                  <Bot className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-white" style={{ fontSize: "1.05rem", fontWeight: 700 }}>Create Chatbot</h3>
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Set up a new assistant workspace</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 block mb-1.5" style={{ fontSize: "0.75rem" }}>Chatbot Name</label>
                  <input
                    type="text"
                    value={newChatbotName}
                    onChange={(e) => setNewChatbotName(e.target.value)}
                    placeholder="Enter chatbot name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>

              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl transition-all"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newChatbotName.trim() || creating}
                  onClick={handleCreateChatbot}
                  className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl transition-all"
                  style={{ fontSize: "0.82rem", fontWeight: 700 }}
                >
                  {creating ? "Creating..." : "Create Chatbot"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
