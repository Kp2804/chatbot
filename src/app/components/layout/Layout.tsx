import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router";
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
  Sun,
  User,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

const navItems = [
  { path: "/app/chat", icon: MessageSquare, label: "Chat" },
  { path: "/app/workflows", icon: GitBranch, label: "Workflows" },
  { path: "/app/faq", icon: HelpCircle, label: "FAQ Manager" },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const activeChatbotId = localStorage.getItem("activeChatbotId");
  const chatNavPath = activeChatbotId ? `/app/chat/${activeChatbotId}` : "/app";
  const isSelectionScreen = location.pathname === "/app";

  // Initialize dark mode from localStorage
  useEffect(() => {
    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode !== null) {
      const isDark = JSON.parse(savedDarkMode);
      setIsDarkMode(isDark);
      applyTheme(isDark);
    } else {
      // Default to dark mode
      applyTheme(true);
    }
  }, []);

  // Handle clicks outside user menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  const applyTheme = (isDark: boolean) => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  };

  const handleDarkModeToggle = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem("darkMode", JSON.stringify(newDarkMode));
    applyTheme(newDarkMode);
  };

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

  if (isSelectionScreen) {
    return (
      <div className="w-full h-screen bg-white dark:bg-[#0f0f13] text-black dark:text-white overflow-hidden">
        <main className="h-full overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    // use `h-full` so the root container fills the height of html/body/#root
    // instead of relying on `100vh` which can shrink on mobile when the
    // browser chrome or keyboard appears. this keeps the app pinned to the
    // visible viewport and prevents the half-black clipping issue.
    <div className="flex w-full h-screen bg-white dark:bg-[#0f0f13] text-black dark:text-white overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-gray-300 dark:border-white/8 bg-gray-50 dark:bg-[#12121a] transition-all duration-300 relative ${collapsed ? "w-16" : "w-60"
          }`}
      >
        {/* Collapse Toggle */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-12 -right-3 w-6 h-6 bg-gray-200 dark:bg-[#1e1e2e] border border-gray-300 dark:border-white/10 rounded-full flex items-center justify-center text-gray-500 dark:hover:text-white hover:text-gray-700 transition-all z-50 hover:scale-110 active:scale-95 shadow-lg"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-300 dark:border-white/8 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/25">
            <Bot className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <div className="text-black dark:text-white" style={{ fontSize: "0.95rem", fontWeight: 700 }}>NexusBot</div>
              <div className="text-gray-600 dark:text-gray-600" style={{ fontSize: "0.68rem" }}>AI Platform</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
          {!collapsed && (
            <p className="text-gray-600 dark:text-gray-600 px-3 mb-2" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Main Menu
            </p>
          )}
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path === "/app/chat" ? chatNavPath : item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${isActive
                  ? "bg-violet-500/15 text-violet-400 border border-violet-500/20"
                  : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/5"
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
            <p className="text-gray-600 dark:text-gray-600 px-3 mb-2 mt-5" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Analytics
            </p>
          )}
          {collapsed && <div className="my-2 border-t border-gray-300 dark:border-white/8 mx-2" />}
          <NavLink
            to="/app/analytics"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive
                ? "bg-violet-500/15 text-violet-400 border border-violet-500/20"
                : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/5"
              } ${collapsed ? "justify-center" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <BarChart2 className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-violet-400" : ""}`} />
                {!collapsed && <span style={{ fontSize: "0.875rem", fontWeight: isActive ? 600 : 400 }}>Analysis</span>}
              </>
            )}
          </NavLink>
          <button type="button" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/5 transition-all ${collapsed ? "justify-center" : ""}`}>
            <Settings className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && <span style={{ fontSize: "0.875rem" }}>Settings</span>}
          </button>
        </nav>

        {/* User */}
        <div className="border-t border-gray-300 dark:border-white/8 p-3 bg-gray-100 dark:bg-[#12121a]">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-400 rounded-lg flex items-center justify-center flex-shrink-0 text-white" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
              {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-black dark:text-white truncate" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{user?.user_metadata?.full_name || 'User'}</div>
                <div className="text-gray-600 dark:text-gray-500 truncate" style={{ fontSize: "0.7rem" }}>{user?.email}</div>
              </div>
            )}
            {!collapsed && (
              <button
                type="button"
                onClick={handleLogout}
                className="text-gray-600 dark:text-gray-600 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
        <header className="h-14 border-b border-gray-300 dark:border-white/8 flex items-center justify-between px-6 bg-white/80 dark:bg-[#0f0f13]/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-sm">
            <div className="flex-1 flex items-center gap-2 bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/8 rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-gray-600 dark:text-gray-600" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent text-gray-800 dark:text-gray-400 placeholder-gray-700 dark:placeholder-gray-600 focus:outline-none flex-1"
                style={{ fontSize: "0.8rem" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="relative w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 rounded-lg transition-all">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-violet-500 rounded-full" />
            </button>
            <button
              type="button"
              onClick={handleDarkModeToggle}
              className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 rounded-lg transition-all"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-400 rounded-lg flex items-center justify-center text-white hover:shadow-lg transition-all hover:scale-105 active:scale-95"
                style={{ fontSize: "0.7rem", fontWeight: 700 }}
                title="User menu"
              >
                {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-100 dark:bg-[#16161e] border border-gray-300 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-3 border-b border-gray-300 dark:border-white/8 bg-white dark:bg-transparent">
                    <p className="text-black dark:text-white text-sm font-semibold truncate">{user?.user_metadata?.full_name || 'User'}</p>
                    <p className="text-gray-600 dark:text-gray-500 text-xs truncate">{user?.email}</p>
                  </div>
                  
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigate("/app/profile");
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 transition-all text-sm"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 transition-all text-sm"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </button>
                  </div>

                  <div className="border-t border-gray-300 dark:border-white/8 py-1">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/10 transition-all text-sm"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}