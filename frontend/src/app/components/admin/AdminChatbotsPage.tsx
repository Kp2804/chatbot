import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2, Loader2, RefreshCw, Search } from "lucide-react";
import { getAccessToken } from "../../../lib/supabase";

interface AdminChatbotRow {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  user_email: string | null;
  created_at: string;
  updated_at: string;
}

export function AdminChatbotsPage() {
  const [rows, setRows] = useState<AdminChatbotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL || "";

  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getAccessToken();
      if (!token) throw new Error("Missing session token");

      const response = await fetch(`${backendUrl}/api/admin/chatbots`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to load chatbots (${response.status})`);
      }

      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load admin chatbot data");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.name,
        row.user_email || "",
        row.id,
        row.user_id,
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search]);

  const handleDelete = useCallback(async (row: AdminChatbotRow) => {
    const confirmed = window.confirm(`Delete chatbot "${row.name}" created by ${row.user_email || "unknown user"}?`);
    if (!confirmed) return;

    try {
      setDeletingId(row.id);
      const token = await getAccessToken();
      if (!token) throw new Error("Missing session token");

      const response = await fetch(`${backendUrl}/api/admin/chatbots/${row.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Delete failed");
      }

      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err: any) {
      window.alert(err?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }, [backendUrl]);

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-[#0b0b11]">
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Admin</p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">All Customer Chatbots</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Review and delete any chatbot created by customers.</p>
          </div>

          <button
            type="button"
            onClick={() => void loadRows()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 dark:border-white/10 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-gray-300 dark:border-white/10 bg-white dark:bg-[#151520] p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by chatbot name, customer email, or id"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-[#0f0f16] text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-300 dark:border-white/10 bg-white dark:bg-[#151520] overflow-hidden">
          {loading ? (
            <div className="py-14 flex items-center justify-center gap-2 text-gray-600 dark:text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading chatbot list...
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-700 dark:text-red-300">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-sm text-gray-600 dark:text-gray-300">No chatbots found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                  <tr>
                    <th className="text-left text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 px-4 py-3">Chatbot</th>
                    <th className="text-left text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 px-4 py-3">Customer Email</th>
                    <th className="text-left text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 px-4 py-3">Created</th>
                    <th className="text-left text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 px-4 py-3">Chatbot ID</th>
                    <th className="text-right text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-200 dark:border-white/10 last:border-0">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{row.name}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[240px]">{row.description || "No description"}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">{row.user_email || "Unknown"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{row.id}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={deletingId === row.id}
                          onClick={() => void handleDelete(row)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-60"
                        >
                          {deletingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
