/**
 * @file useAuth.tsx
 * @description A custom React hook for managing global authentication state.
 * 
 * Key Features:
 * - Listens to Supabase Auth state changes (login, logout, session refresh)
 * - Fetches and merges custom profile data (e.g., admin status, approval status)
 * - Handles subscription expiration logic for access control
 * - Exposes easy-to-use variables (`user`, `isAdmin`, `isApproved`) for route protection
 */
import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const LOGIN_TIME_KEY = 'auth_login_time_ms';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  isRejected: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAdmin: false,
    isApproved: false,
    isRejected: false,
  });

  useEffect(() => {
    const clearStoredLoginTime = () => {
      localStorage.removeItem(LOGIN_TIME_KEY);
    };

    const setStoredLoginTime = (timeMs: number) => {
      localStorage.setItem(LOGIN_TIME_KEY, String(timeMs));
    };

    const getStoredLoginTime = () => {
      const raw = localStorage.getItem(LOGIN_TIME_KEY);
      if (!raw) {
        return null;
      }

      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const isSessionTimedOut = () => {
      const loginTimeMs = getStoredLoginTime();
      if (!loginTimeMs) {
        return false;
      }

      return Date.now() - loginTimeMs >= SESSION_TIMEOUT_MS;
    };

    const forceSignOutForTimeout = async () => {
      await supabase.auth.signOut();
      clearStoredLoginTime();
      setAuthState({
        user: null,
        session: null,
        isLoading: false,
        isAdmin: false,
        isApproved: false,
        isRejected: false,
      });
    };

    const handleAuthChange = async (session: Session | null, event?: string) => {
      if (!session?.user) {
        clearStoredLoginTime();
        setAuthState({
          user: null,
          session: null,
          isLoading: false,
          isAdmin: false,
          isApproved: false,
          isRejected: false,
        });
        return;
      }

      if (event === 'SIGNED_IN') {
        setStoredLoginTime(Date.now());
      }

      if (!getStoredLoginTime()) {
        setStoredLoginTime(Date.now());
      }

      if (isSessionTimedOut()) {
        await forceSignOutForTimeout();
        return;
      }

      // Keep loading true while fetching permissions
      setAuthState(prev => ({ ...prev, isLoading: true }));

      try {
        const [adminResult, approvalResult] = await Promise.all([
          supabase.rpc('has_role', {
            _user_id: session.user.id,
            _role: 'admin',
          }),
          supabase
            .from('profiles')
            .select('is_approved, is_rejected, subscription_end_date')
            .eq('id', session.user.id)
            .single()
        ]);

        const isAdmin = !adminResult.error && !!adminResult.data;
        const isRejected = !approvalResult.error && !!approvalResult.data?.is_rejected;

        // If the user has been rejected, force sign them out immediately
        if (isRejected && !isAdmin) {
          await supabase.auth.signOut();
          clearStoredLoginTime();
          setAuthState({
            user: null,
            session: null,
            isLoading: false,
            isAdmin: false,
            isApproved: false,
            isRejected: true,
          });
          return;
        }

        // Check if subscription is expired (if date exists)
        let isApproved = !approvalResult.error && approvalResult.data?.is_approved;

        if (isApproved && approvalResult.data?.subscription_end_date) {
          const endDate = new Date(approvalResult.data.subscription_end_date);
          if (endDate < new Date()) {
            isApproved = false; // Expired
            console.log('User subscription expired on:', endDate);
          }
        }

        setAuthState({
          user: session.user,
          session,
          isLoading: false,
          isAdmin,
          isApproved,
          isRejected: false,
        });
      } catch (error) {
        console.error('Auth check error:', error);
        setAuthState({
          user: session.user,
          session,
          isLoading: false,
          isAdmin: false,
          isApproved: false,
          isRejected: false,
        });
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        handleAuthChange(session, event);
      }
    );

    const timeoutInterval = window.setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isSessionTimedOut()) {
        await forceSignOutForTimeout();
      }
    }, 60 * 1000);

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      // If we have a session, handleAuthChange will be called by onAuthStateChange?
      // Actually onAuthStateChange fires with INITIAL_SESSION event usually.
      // But to be safe and redundant (sometimes good for auth), we can call it if needed.
      // However, usually duplicate calls can cause flickering.
      // Let's rely on onAuthStateChange, but if it doesn't fire immediately, we might need manual check.
      // Better pattern:
      if (session) {
        handleAuthChange(session, 'INITIAL_SESSION');
      }
    });

    return () => {
      subscription.unsubscribe();
      window.clearInterval(timeoutInterval);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(LOGIN_TIME_KEY);
    setAuthState({
      user: null,
      session: null,
      isLoading: false,
      isAdmin: false,
      isApproved: false,
      isRejected: false,
    });
  };

  return {
    ...authState,
    signOut,
  };
};
