import { useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export type AppRole = "superadmin" | "admin" | "customer";

const adminEmails = new Set(
  (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean),
);

const superAdminEmails = new Set(
  (import.meta.env.VITE_SUPERADMIN_EMAILS || "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean),
);

function roleFromUser(user: User | null): AppRole | null {
  if (!user) return null;

  const email = (user.email || "").toLowerCase();
  if (email && superAdminEmails.has(email)) return "superadmin";

  const metadataRole = String(
    user.user_metadata?.app_role
    || user.user_metadata?.role
    || (user as any).app_metadata?.app_role
    || (user as any).app_metadata?.role
    || ""
  ).toLowerCase();
  if (metadataRole === "superadmin") return "superadmin";
  if (metadataRole === "admin") return "admin";

  if (email && adminEmails.has(email)) return "admin";

  return "customer";
}

export function useUserRole() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        setUser(data.session?.user ?? null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const role = useMemo(() => roleFromUser(user), [user]);

  return {
    user,
    role,
    loading,
    isSuperAdmin: role === "superadmin",
    isAdmin: role === "admin" || role === "superadmin",
    isCustomer: role === "customer",
  };
}
