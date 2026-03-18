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
    <div className="w-full h-screen flex bg-white dark:bg-[#08080c]">
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
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: `${window.location.origin}/app` },
                  });
                  if (error) throw error;
                } catch (err: any) {
                  alert(err.message || "Google sign-in failed");
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 rounded-xl py-3 transition-all shadow-lg hover:shadow-xl disabled:opacity-70 font-medium"
              style={{ fontSize: "0.95rem" }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    <path fill="none" d="M1 1h22v22H1z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
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