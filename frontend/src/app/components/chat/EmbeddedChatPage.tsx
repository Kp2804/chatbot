import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { ChatInterface } from "./ChatInterface";
import { useTranslation } from "react-i18next";

export function EmbeddedChatPage() {
  const { t } = useTranslation();
  const { chatbotId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Get user name from URL parameter
  const userName = searchParams.get('userName') || '';

  useEffect(() => {
    const initialize = async () => {
      if (!chatbotId) {
        navigate("/auth");
        return;
      }

      localStorage.setItem("activeChatbotId", chatbotId);

      // Timeout: if auth takes more than 10s, show an error instead of spinner forever
      const timeout = setTimeout(() => {
        setAuthError("Chat took too long to load. Please refresh the page.");
      }, 10000);

      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          await supabase.auth.signInAnonymously();
        }

        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          setAuthError("No user session available. Please refresh the page.");
          return;
        }

        clearTimeout(timeout);
        setReady(true);
      } catch (error) {
        clearTimeout(timeout);
        console.error("Embedded chat init failed:", error);
        setAuthError("Failed to connect. Please refresh the page.");
      }
    };

    initialize();
  }, [chatbotId, navigate]);

  if (!ready) {
    if (authError) {
      return (
        <div className="dark" style={{ height: '100vh', background: '#0f0f13', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
          <div>
            <h2 style={{ color: '#ffffff', fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>{t('chat.authorizationError')}</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{authError}</p>
          </div>
        </div>
      );
    }

    return (
      <div style={{ height: '100vh', background: '#0f0f13', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: '#a78bfa' }} />
        <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{t('chat.loadingChat')}</span>
      </div>
    );
  }

  return (
    <div className="dark" style={{ height: '100vh', width: '100%', background: '#0f0f13' }}>
      <ChatInterface embedded userName={userName} />
    </div>
  );
}
