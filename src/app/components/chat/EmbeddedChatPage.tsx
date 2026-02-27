import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { ChatInterface } from "./ChatInterface";

export function EmbeddedChatPage() {
  const { chatbotId } = useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

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
        }
      }

      setReady(true);
    };

    initialize();
  }, [chatbotId, navigate]);

  if (!ready) {
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
