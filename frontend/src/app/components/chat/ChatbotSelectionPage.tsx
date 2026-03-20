import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bot, Plus, ArrowRight, RefreshCw } from "lucide-react";
import { getAccessToken, supabase } from "../../../lib/supabase";
import { toast } from "sonner";
import { EmptyState, ErrorState, MetricCardSkeleton } from "../ui/feedback";

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
  const [createError, setCreateError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

  useEffect(() => {
    fetchChatbots();
  }, []);

  const createChatbotViaBackend = async (name: string, description: string) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Please sign in to create a chatbot");
    }

    const response = await fetch(`${backendUrl}/api/chatbots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, description }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === "string"
        ? payload.error
        : `Failed to create chatbot (${response.status})`;
      throw new Error(message);
    }

    return payload as Chatbot;
  };

  const fetchChatbots = async () => {
    try {
      setLoading(true);
      setFetchError("");
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
      setChatbots(list);
    } catch (error: any) {
      console.error("Error fetching chatbots:", error.message);
      setFetchError(error?.message || "We could not load your bots right now.");
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
    setCreateError("");

    try {
      const data = await createChatbotViaBackend(trimmedName, "");
      setChatbots((prev) => [...prev, data]);
      setNewChatbotName("");
      setShowCreateModal(false);
      toast.success("Chatbot created successfully");
    } catch (error: any) {
      const message = error?.message || "Error creating chatbot";
      setCreateError(message);
      console.error("Error creating chatbot:", message);
      toast.error("Could not create chatbot");
    } finally {
      setCreating(false);
    }
  };

  const openCreateModal = () => {
    setNewChatbotName(`Chatbot ${chatbots.length + 1}`);
    setShowCreateModal(true);
  };

  const handleSelectChatbot = (chatbotId: string) => {
    localStorage.setItem("activeChatbotId", chatbotId);
    navigate(`/app/chat/${chatbotId}`);
  };

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-[#08080c]">
      <div className="max-w-5xl mx-auto p-10">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-gray-900 dark:text-purple-100 mb-2 leading-none" style={{ fontSize: "2.3rem", fontWeight: 900, letterSpacing: "-0.03em" }}>
              Select Chatbot
            </h1>
            <p className="text-emerald-700 dark:text-purple-300/80 font-bold uppercase tracking-[0.2em]" style={{ fontSize: "0.7rem" }}>
              Choose a chatbot to open conversations
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 dark:from-violet-600 dark:to-indigo-700 dark:hover:from-violet-700 dark:hover:to-indigo-800 text-white rounded-2xl transition-all shadow-lg shadow-emerald-600/25 dark:shadow-violet-600/25"
            style={{ fontSize: "0.85rem", fontWeight: 700 }}
          >
            <Plus className="w-4 h-4" /> Create Chatbot
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        ) : fetchError ? (
          <ErrorState
            message="We were unable to load your chatbots. Please check your connection and retry."
            onRetry={fetchChatbots}
            className="max-w-xl"
          />
        ) : chatbots.length === 0 ? (
          <EmptyState
            title="No bots yet"
            description="Create your first chatbot to start handling conversations and knowledge workflows."
            actionLabel="Create your first bot"
            onAction={openCreateModal}
            className="max-w-2xl mx-auto"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {chatbots.map((bot) => (
              <button
                key={bot.id}
                type="button"
                onClick={() => handleSelectChatbot(bot.id)}
                className="group bg-white dark:bg-[#0f0f17] hover:bg-emerald-50 dark:hover:bg-[#151525] border border-emerald-100 dark:border-purple-500/20 hover:border-emerald-500/40 dark:hover:border-purple-400/50 rounded-[1.8rem] p-6 text-left transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-emerald-500/15 dark:bg-purple-500/20 rounded-2xl flex items-center justify-center">
                    <Bot className="w-6 h-6 text-emerald-600 dark:text-purple-300" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-emerald-400 dark:text-purple-400/70 group-hover:text-emerald-600 dark:group-hover:text-purple-300 transition-colors" />
                </div>
                <h3 className="text-gray-900 dark:text-purple-100 mb-2" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{bot.name}</h3>
                <p className="text-emerald-800/80 dark:text-purple-300/70" style={{ fontSize: "0.8rem" }}>
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
                    className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-800 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 dark:border-purple-500/35 dark:text-purple-200 dark:hover:text-purple-100 rounded-lg transition-colors"
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
            <div className="w-full max-w-md bg-white dark:bg-[#111019] border border-emerald-100 dark:border-purple-500/25 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 bg-emerald-500/15 dark:bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Bot className="w-5 h-5 text-emerald-600 dark:text-purple-300" />
                </div>
                <div>
                  <h3 className="text-gray-900 dark:text-purple-100" style={{ fontSize: "1.05rem", fontWeight: 700 }}>Create Chatbot</h3>
                  <p className="text-emerald-700/80 dark:text-purple-300/70" style={{ fontSize: "0.75rem" }}>Set up a new assistant workspace</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-emerald-800 dark:text-purple-200 block mb-1.5" style={{ fontSize: "0.75rem" }}>Chatbot Name</label>
                  <input
                    type="text"
                    value={newChatbotName}
                    onChange={(e) => setNewChatbotName(e.target.value)}
                    placeholder="Enter chatbot name"
                    className="w-full bg-white dark:bg-[#1a1627] border border-emerald-300 dark:border-purple-500/35 rounded-xl px-3 py-2.5 text-gray-900 dark:text-purple-100 placeholder-emerald-500/70 dark:placeholder-purple-300/50 focus:outline-none focus:border-emerald-500 dark:focus:border-purple-400"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>

                {createError && (
                  <p className="text-red-600 dark:text-red-300" style={{ fontSize: "0.75rem" }}>
                    {createError || "Please try a different name or retry in a moment."}
                  </p>
                )}

              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-900 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 dark:border-purple-500/35 dark:text-purple-200 rounded-xl transition-all"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newChatbotName.trim() || creating}
                  onClick={handleCreateChatbot}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 dark:from-purple-600 dark:to-fuchsia-700 dark:hover:from-purple-700 dark:hover:to-fuchsia-800 disabled:opacity-50 text-white rounded-xl transition-all"
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
