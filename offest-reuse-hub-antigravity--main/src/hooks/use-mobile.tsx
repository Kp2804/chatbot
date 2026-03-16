/**
 * @file use-mobile.tsx
 * @description A custom hook that detects if the current viewport is mobile-sized.
 * 
 * Key Features:
 * - Uses `window.matchMedia` to listen for screen width changes (< 768px)
 * - Returns a boolean `isMobile` that components can use for responsive rendering logic
 */
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
