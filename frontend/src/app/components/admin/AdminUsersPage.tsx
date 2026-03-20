import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, ShieldCheck, ShieldOff, Sparkles, Users2, Shield, User } from "lucide-react";
import { getAccessToken } from "../../../lib/supabase";

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "customer";
  chatbot_count: number;
}

export function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "superadmin" | "admin" | "customer">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getAccessToken();
      if (!token) throw new Error("Missing session token");

      const response = await fetch(`${backendUrl}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to load users (${response.status})`);
      }

      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !term || [row.name, row.email, row.role].join(" ").toLowerCase().includes(term);
      const matchesRole = roleFilter === "all" || row.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [rows, search, roleFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const superadmins = rows.filter((row) => row.role === "superadmin").length;
    const admins = rows.filter((row) => row.role === "admin").length;
    const customers = rows.filter((row) => row.role === "customer").length;
    return { total, superadmins, admins, customers };
  }, [rows]);

  const roleBadgeClass = (role: AdminUserRow["role"]) => {
    if (role === "superadmin") {
      return "bg-gradient-to-r from-fuchsia-600/20 to-violet-500/20 text-fuchsia-200 border border-fuchsia-400/30";
    }
    if (role === "admin") {
      return "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30";
    }
    return "bg-white/10 text-gray-300 border border-white/15";
  };

  const userInitial = (row: AdminUserRow) => {
    const source = row.name?.trim() || row.email || "U";
    return source.charAt(0).toUpperCase();
  };

  const handleRoleToggle = useCallback(async (row: AdminUserRow) => {
    if (row.role === "superadmin") return;

    const targetRole = row.role === "admin" ? "customer" : "admin";
    const confirmText = targetRole === "admin"
      ? `Make ${row.email} an admin?`
      : `Remove admin access from ${row.email}?`;

    if (!window.confirm(confirmText)) return;

    try {
      setUpdatingId(row.id);
      const token = await getAccessToken();
      if (!token) throw new Error("Missing session token");

      const response = await fetch(`${backendUrl}/api/admin/users/${row.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: targetRole }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update role");
      }

      setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, role: targetRole } : item));
    } catch (err: any) {
      window.alert(err?.message || "Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  }, [backendUrl]);

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(1000px_500px_at_100%_-10%,rgba(99,102,241,0.18),transparent),radial-gradient(700px_400px_at_0%_0%,rgba(20,184,166,0.16),transparent)] bg-[#070911]">
      <div className="max-w-7xl mx-auto p-5 md:p-8 space-y-6">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#11132a] via-[#101828] to-[#0f2127] p-6 md:p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-200/80 mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Superadmin Control
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-white">Users & Access Governance</h1>
              <p className="text-sm md:text-base text-white/70 mt-2">Promote or revoke admin access without leaving the dashboard.</p>
            </div>

            <button
              type="button"
              onClick={() => void loadRows()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/20 bg-white/5 text-white hover:bg-white/10 transition"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-white/60">Total Users</p>
              <p className="text-2xl font-semibold text-white mt-1">{stats.total}</p>
            </div>
            <div className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-fuchsia-200/80">Superadmins</p>
              <p className="text-2xl font-semibold text-fuchsia-100 mt-1">{stats.superadmins}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-200/80">Admins</p>
              <p className="text-2xl font-semibold text-emerald-100 mt-1">{stats.admins}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/60">Customers</p>
              <p className="text-2xl font-semibold text-white mt-1">{stats.customers}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#101520] p-4 md:p-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or role"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-white/15 bg-[#0a0f19] text-white placeholder:text-gray-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", "superadmin", "admin", "customer"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRoleFilter(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs uppercase tracking-wide border transition ${
                    roleFilter === value
                      ? "bg-violet-500/20 border-violet-400/40 text-violet-100"
                      : "bg-transparent border-white/15 text-gray-300 hover:bg-white/5"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0d1320] overflow-hidden">
          {loading ? (
            <div className="py-20 flex items-center justify-center gap-2 text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading users...
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-300">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-300">No users match your current filters.</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="text-left text-xs uppercase tracking-wide text-gray-400 px-5 py-3">User</th>
                      <th className="text-left text-xs uppercase tracking-wide text-gray-400 px-5 py-3">Contact</th>
                      <th className="text-left text-xs uppercase tracking-wide text-gray-400 px-5 py-3">Chatbots</th>
                      <th className="text-left text-xs uppercase tracking-wide text-gray-400 px-5 py-3">Role</th>
                      <th className="text-right text-xs uppercase tracking-wide text-gray-400 px-5 py-3">Access Control</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="border-b border-white/10 hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/30 to-indigo-500/30 border border-cyan-300/20 flex items-center justify-center text-cyan-100 font-semibold text-sm">
                              {userInitial(row)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{row.name || "User"}</p>
                              <p className="text-xs text-gray-400">ID: {row.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-300">{row.email}</td>
                        <td className="px-5 py-4">
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-200 text-sm">
                            <Users2 className="w-3.5 h-3.5" /> {row.chatbot_count}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 text-xs rounded-full ${roleBadgeClass(row.role)}`}>
                            {row.role}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.role === "superadmin" ? (
                            <span className="inline-flex items-center gap-2 text-xs text-fuchsia-200/80 px-3 py-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10">
                              <Shield className="w-3.5 h-3.5" /> Protected
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={updatingId === row.id}
                              onClick={() => void handleRoleToggle(row)}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition disabled:opacity-60"
                            >
                              {updatingId === row.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : row.role === "admin" ? (
                                <ShieldOff className="w-4 h-4" />
                              ) : (
                                <ShieldCheck className="w-4 h-4" />
                              )}
                              {row.role === "admin" ? "Remove admin" : "Make admin"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden p-3 space-y-3">
                {filteredRows.map((row) => (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/30 to-indigo-500/30 border border-cyan-300/20 flex items-center justify-center text-cyan-100 text-sm font-semibold">
                          {userInitial(row)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{row.name || "User"}</p>
                          <p className="text-xs text-gray-400">{row.email}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-1 text-[11px] rounded-full ${roleBadgeClass(row.role)}`}>
                        {row.role}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-300">
                      <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> ID: {row.id.slice(0, 8)}...</span>
                      <span className="inline-flex items-center gap-1"><Users2 className="w-3.5 h-3.5" /> {row.chatbot_count} bots</span>
                    </div>

                    {row.role === "superadmin" ? (
                      <div className="text-xs text-fuchsia-200/80 px-3 py-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 text-center">
                        Protected superadmin account
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() => void handleRoleToggle(row)}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition disabled:opacity-60"
                      >
                        {updatingId === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : row.role === "admin" ? (
                          <ShieldOff className="w-4 h-4" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        {row.role === "admin" ? "Remove admin" : "Make admin"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
