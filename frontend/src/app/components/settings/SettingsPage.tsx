import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Sun, Moon, User } from "lucide-react";
import { supabase } from "../../../lib/supabase";

export function SettingsPage() {
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [chatbots, setChatbots] = useState<any[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    if (saved !== null) {
      const val = JSON.parse(saved);
      setIsDarkMode(val);
      applyTheme(val);
    }
  }, []);

  useEffect(() => {
    // load user's chatbots to offer "manage" links
    const fetch = async () => {
      try {
        setLoadingBots(true);
        const { data: userData } = await supabase.auth.getUser();
        const currentUser = userData.user;
        if (!currentUser) {
          navigate("/auth");
          return;
        }

        const { data, error } = await supabase
          .from("chatbots")
          .select("id,name")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setChatbots(data || []);
      } catch (e) {
        console.error("Failed to load chatbots", e);
      } finally {
        setLoadingBots(false);
      }
    };
    fetch();
  }, [navigate]);

  const applyTheme = (dark: boolean) => {
    const html = document.documentElement;
    if (dark) html.classList.add("dark");
    else html.classList.remove("dark");
  };

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem("darkMode", JSON.stringify(next));
    applyTheme(next);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-between">
          <span className="font-medium">Dark mode</span>
          <button
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-[#1e1e2e] rounded-full"
            title={isDarkMode ? "Switch to light" : "Switch to dark"}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div>
          <button
            onClick={() => navigate("/app/profile")}
            className="flex items-center gap-2 text-blue-600 hover:underline"
          >
            <User className="w-4 h-4" /> Manage profile
          </button>
        </div>

        <div>
          <p className="text-gray-600 dark:text-gray-400">More settings will be added here soon.</p>
        </div>

        {/* Chatbots section */}
        <div>
          <h2 className="text-lg font-medium mb-2">Your chatbots</h2>
          {loadingBots ? (
            <p className="text-gray-500">Loading…</p>
          ) : chatbots.length ? (
            <ul className="space-y-2">
              {chatbots.map((bot) => (
                <li key={bot.id} className="flex justify-between items-center">
                  <span>{bot.name || "(untitled)"}</span>
                  <button
                    onClick={() => navigate(`/app/chat/${bot.id}/manage`)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Manage
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">You don&apos;t have any chatbots yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
