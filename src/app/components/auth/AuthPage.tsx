import { useState } from "react";
import { useNavigate } from "react-router";
import { Bot, Eye, EyeOff, Loader2, Mail, Lock, User, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "../../../lib/supabase";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log('Form submitted:', mode, form.email);

    try {
      // Create a timeout promise
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout. Please check your internet or DNS settings.")), 10000)
      );

      const authPromise = mode === "login"
        ? supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })
        : supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              full_name: form.name,
            },
          },
        });

      // Race against the timeout
      const result: any = await Promise.race([authPromise, timeout]);

      if (result.error) throw result.error;

      if (mode === "signup" && !result.data?.session) {
        alert("Account created! Please check your email for the confirmation link before signing in.");
        setMode("login");
      } else {
        navigate("/app");
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      alert(error.message || "An error occurred during authentication");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen flex bg-[#0f0f13] dark">
      {/* Left Panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden flex-col items-center justify-center p-12">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/50 via-indigo-900/40 to-[#0f0f13]" />
        <div className="absolute top-0 left-0 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

        <div className="relative z-10 text-center max-w-md">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl mb-8 shadow-2xl shadow-violet-500/30">
            <Bot className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-white mb-4" style={{ fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.15 }}>
            Your AI-Powered<br />Chat Assistant
          </h1>
          <p className="text-gray-400 mb-10" style={{ fontSize: "1.05rem", lineHeight: 1.7 }}>
            Build smarter workflows, manage FAQs, and deliver instant answers — all in one intelligent platform.
          </p>

          {/* Feature Pills */}
          <div className="flex flex-col gap-3 text-left">
            {[
              { icon: "💬", text: "Multi-turn conversational AI" },
              { icon: "⚡", text: "Visual workflow automation" },
              { icon: "📚", text: "Dynamic FAQ knowledge base" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3">
                <span style={{ fontSize: "1.25rem" }}>{f.icon}</span>
                <span className="text-gray-300" style={{ fontSize: "0.9rem" }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Chat Bubbles decoration */}
        <div className="absolute top-24 right-12 bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-2 text-gray-400" style={{ fontSize: "0.8rem" }}>
          How can I help you today? ✨
        </div>
        <div className="absolute bottom-28 left-10 bg-violet-500/20 border border-violet-500/30 rounded-2xl rounded-br-sm px-4 py-2 text-violet-300" style={{ fontSize: "0.8rem" }}>
          I found 3 answers for you!
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="text-white" style={{ fontSize: "1.2rem", fontWeight: 700 }}>NexusBot</span>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
            <div className="mb-6">
              <h2 className="text-white mb-1" style={{ fontSize: "1.6rem", fontWeight: 700 }}>
                {mode === "login" ? "Welcome back" : "Create account"}
              </h2>
              <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
                {mode === "login"
                  ? "Sign in to your dashboard"
                  : "Get started with NexusBot"}
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="flex bg-white/5 rounded-xl p-1 mb-6">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg transition-all ${mode === m
                    ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg"
                    : "text-gray-500 hover:text-gray-300"
                    }`}
                  style={{ fontSize: "0.875rem", fontWeight: mode === m ? 600 : 400 }}
                >
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "signup" && (
                <div>
                  <label className="text-gray-400 block mb-1.5" style={{ fontSize: "0.8rem" }}>Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-gray-400 block mb-1.5" style={{ fontSize: "0.8rem" }}>Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-400 block mb-1.5" style={{ fontSize: "0.8rem" }}>Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                    style={{ fontSize: "0.9rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === "login" && (
                <div className="flex justify-end">
                  <button type="button" className="text-violet-400 hover:text-violet-300 transition-colors" style={{ fontSize: "0.8rem" }}>
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white rounded-xl py-3 flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-500/25 disabled:opacity-70 mt-2"
                style={{ fontSize: "0.95rem", fontWeight: 600 }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Sign In" : "Create Account"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-gray-600" style={{ fontSize: "0.75rem" }}>or continue with</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Social buttons */}
            <div className="grid grid-cols-2 gap-3">
              {["Google", "GitHub"].map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => navigate("/app")}
                  className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-2.5 text-gray-400 hover:text-white transition-all"
                  style={{ fontSize: "0.85rem" }}
                >
                  {provider === "Google" ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M12 11v2.4h6.8c-.3 1.8-2 5.6-6.8 5.6-4.1 0-7.4-3.4-7.4-7.5s3.3-7.5 7.4-7.5c2.3 0 3.9.9 4.8 1.8l1.6-1.6C17.2 3 14.8 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                  )}
                  {provider}
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-gray-600 mt-6" style={{ fontSize: "0.8rem" }}>
            By continuing, you agree to our{" "}
            <span className="text-violet-400 cursor-pointer hover:text-violet-300">Terms</span>
            {" "}and{" "}
            <span className="text-violet-400 cursor-pointer hover:text-violet-300">Privacy Policy</span>
          </p>
        </div>
      </div>
    </div>
  );
}