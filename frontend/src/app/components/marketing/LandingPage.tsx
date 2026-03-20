import { Link } from "react-router";
import { Bot, Sparkles, ShieldCheck, Rocket, CheckCircle2 } from "lucide-react";

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#d1fae5_0%,#ecfdf5_35%,#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-300/50">
              <Bot className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">NexusBot</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="px-4 py-2 rounded-lg border border-emerald-700/20 hover:bg-emerald-50 text-sm font-semibold">
              Sign In
            </Link>
            <Link to="/auth" className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold">
              Start Free
            </Link>
          </div>
        </header>

        <section className="mt-14 grid gap-10 md:grid-cols-[1.2fr,0.8fr] items-center">
          <div>
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Production-ready chatbot widgets for business websites
            </p>
            <h1 className="mt-5 text-4xl md:text-6xl font-black tracking-tight leading-tight">
              Turn website traffic into
              <span className="text-emerald-700"> qualified conversations.</span>
            </h1>
            <p className="mt-5 text-slate-700 text-base md:text-lg max-w-xl">
              Launch branded AI chat widgets with workflows, FAQs, analytics, and knowledge indexing.
              Built for SaaS, agencies, and support teams.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="px-5 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-semibold inline-flex items-center gap-2">
                <Rocket className="w-4 h-4" />
                Start Building
              </Link>
              <Link to="/auth" className="px-5 py-3 rounded-xl border border-slate-300 hover:bg-white font-semibold inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                View Dashboard
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white/80 backdrop-blur p-6 shadow-xl shadow-emerald-200/50">
            <h2 className="text-lg font-bold">Why teams choose NexusBot</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              {[
                "Embeddable widget for any website",
                "Website + PDF knowledge indexing",
                "Visual workflows and FAQ actions",
                "Role-based admin controls",
                "Usage tracking and subscription billing",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
