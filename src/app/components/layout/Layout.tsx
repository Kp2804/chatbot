import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router";
import {
  Bot,
  MessageSquare,
  GitBranch,
  HelpCircle,
  Settings,
  Bell,
  Search,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BarChart2,
  Moon,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

const navItems = [
  { path: "/app", icon: MessageSquare, label: "Chat", exact: true },
  { path: "/app/workflows", icon: GitBranch, label: "Workflows" },
  { path: "/app/faq", icon: HelpCircle, label: "FAQ Manager" },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 5000)
        );
        const sessionPromise = supabase.auth.getSession();

        const result: any = await Promise.race([sessionPromise, timeout]);
        const session = result?.data?.session;

        if (!session) {
          navigate("/auth");
        } else {
          setUser(session.user);
        }
      } catch (err) {
        console.error("Session check failed or timed out", err);
        navigate("/auth"); // Fallback to auth page if network is down
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    // use `h-full` so the root container fills the height of html/body/#root
    // instead of relying on `100vh` which can shrink on mobile when the
    // browser chrome or keyboard appears. this keeps the app pinned to the
    // visible viewport and prevents the half-black clipping issue.
    <div className="flex w-full h-screen bg-[#0f0f13] text-white overflow-hidden dark">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-white/8 bg-[#12121a] transition-all duration-300 relative ${collapsed ? "w-16" : "w-60"
          }`}
      >
        {/* Collapse Toggle */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-12 -right-3 w-6 h-6 bg-[#1e1e2e] border border-white/10 rounded-full flex items-center justify-center text-gray-500 hover:text-white transition-all z-50 hover:scale-110 active:scale-95 shadow-lg"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/8 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/25">
            <Bot className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <div className="text-white" style={{ fontSize: "0.95rem", fontWeight: 700 }}>NexusBot</div>
              <div className="text-gray-600" style={{ fontSize: "0.68rem" }}>AI Platform</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
          {!collapsed && (
            <p className="text-gray-600 px-3 mb-2" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Main Menu
            </p>
          )}
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${isActive
                  ? "bg-violet-500/15 text-violet-400 border border-violet-500/20"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                } ${collapsed ? "justify-center" : ""}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-violet-400" : ""}`} />
                  {!collapsed && (
                    <span style={{ fontSize: "0.875rem", fontWeight: isActive ? 600 : 400 }}>
                      {item.label}
                    </span>
                  )}
                  {!collapsed && isActive && (
                    <div className="ml-auto w-1.5 h-1.5 bg-violet-400 rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          ))}

          {!collapsed && (
            <p className="text-gray-600 px-3 mb-2 mt-5" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Analytics
            </p>
          )}
          {collapsed && <div className="my-2 border-t border-white/8 mx-2" />}
          <button type="button" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all ${collapsed ? "justify-center" : ""}`}>
            <BarChart2 className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && <span style={{ fontSize: "0.875rem" }}>Analytics</span>}
          </button>
          <button type="button" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all ${collapsed ? "justify-center" : ""}`}>
            <Settings className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && <span style={{ fontSize: "0.875rem" }}>Settings</span>}
          </button>
        </nav>

        {/* User */}
        <div className="border-t border-white/8 p-3 bg-[#12121a]">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-400 rounded-lg flex items-center justify-center flex-shrink-0 text-white" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
              {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-white truncate" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{user?.user_metadata?.full_name || 'User'}</div>
                <div className="text-gray-500 truncate" style={{ fontSize: "0.7rem" }}>{user?.email}</div>
              </div>
            )}
            {!collapsed && (
              <button
                type="button"
                onClick={handleLogout}
                className="text-gray-600 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-white/8 flex items-center justify-between px-6 bg-[#0f0f13]/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-sm">
            <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-gray-600" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent text-gray-400 placeholder-gray-600 focus:outline-none flex-1"
                style={{ fontSize: "0.8rem" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="relative w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-violet-500 rounded-full" />
            </button>
            <button type="button" className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <Moon className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-400 rounded-lg flex items-center justify-center text-white" style={{ fontSize: "0.7rem", fontWeight: 700 }}>
              {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}