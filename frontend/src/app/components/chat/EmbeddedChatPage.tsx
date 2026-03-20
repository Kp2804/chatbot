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
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");

  // Get user name from URL parameter
  const userName = searchParams.get('userName') || '';

  useEffect(() => {
    const queryTheme = searchParams.get("theme");
    if (queryTheme === "light" || queryTheme === "dark") {
      setThemeMode(queryTheme);
      return;
    }

    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode !== null) {
      setThemeMode(JSON.parse(savedDarkMode) ? "dark" : "light");
      return;
    }

    setThemeMode("dark");
  }, [searchParams]);

  useEffect(() => {
    const html = document.documentElement;
    if (themeMode === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }

    return () => {
      html.classList.remove("dark");
    };
  }, [themeMode]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "nexus-widget-theme") return;
      if (data.theme === "dark" || data.theme === "light") {
        setThemeMode(data.theme);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const isDark = themeMode === "dark";

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
        <div
          className={isDark ? "dark" : ""}
          style={{
            height: '100vh',
            background: isDark ? '#111019' : '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center'
          }}
        >
          <div>
            <h2 style={{ color: isDark ? '#ede9fe' : '#052e1b', fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>{t('chat.authorizationError')}</h2>
            <p style={{ color: isDark ? '#a78bfa' : '#047857', fontSize: '0.85rem' }}>{authError}</p>
          </div>
        </div>
      );
    }

    return (
      <div
        className={isDark ? "dark" : ""}
        style={{
          height: '100vh',
          background: isDark ? '#111019' : '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px'
        }}
      >
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: isDark ? '#a78bfa' : '#059669' }} />
        <span style={{ color: isDark ? '#a78bfa' : '#047857', fontSize: '0.85rem' }}>{t('chat.loadingChat')}</span>
      </div>
    );
  }

  return (
    <div
      className={isDark ? "dark" : ""}
      style={{ height: '100vh', width: '100%', background: isDark ? '#111019' : '#ffffff' }}
    >
      <ChatInterface embedded userName={userName} />
    </div>
  );
}
