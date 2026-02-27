import { useState, useCallback } from "react";

/**
 * Works like useState but persists to sessionStorage.
 * State lives in the browser tab and is cleared when the tab is closed.
 * Nothing is sent to a server or stored permanently.
 */
export function useSessionState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = sessionStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setSessionState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [key]
  );

  return [state, setSessionState];
}
