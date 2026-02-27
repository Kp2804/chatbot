import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { ChatInterface } from "./ChatInterface";

export function EmbeddedChatPage() {
  const { chatbotId } = useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      if (!chatbotId) {
        navigate("/auth");
        return;
      }

      localStorage.setItem("activeChatbotId", chatbotId);

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        try {
          await supabase.auth.signInAnonymously();
        } catch (error) {
          console.error("Anonymous sign-in failed:", error);
          setAuthError("Embedded chat auth failed. Enable Anonymous sign-ins in Supabase Auth > Providers and try again.");
          return;
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setAuthError("No user session available for embedded chat. Please check Supabase auth settings.");
        return;
      }

      setReady(true);
    };

    initialize();
  }, [chatbotId, navigate]);

  if (!ready) {
    if (authError) {
      return (
        <div className="h-screen flex items-center justify-center bg-[#08080c] text-gray-300 p-6 text-center">
          <div className="max-w-md">
            <h2 className="text-white text-lg font-semibold mb-2">Chatbot is loaded but not authorized</h2>
            <p className="text-sm text-gray-400">{authError}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen flex items-center justify-center bg-[#08080c] text-gray-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#08080c]">
      <ChatInterface embedded />
    </div>
  );
}
