import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Triple-arc orbital spinner.
 * Each arc is wrapped in a <g> rotated around the explicit SVG center (50 50)
 * so the animation origin is always correct regardless of browser quirks.
 */
function OrbitSpinner() {
  return (
    <div className="flex flex-col items-center gap-5">
      <svg
        viewBox="0 0 100 100"
        width="88"
        height="88"
        aria-hidden="true"
        style={{ overflow: "visible" }}
      >
        {/* Subtle ghost tracks */}
        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(250 65% 50% / 0.08)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="hsl(280 70% 55% / 0.08)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="15" fill="none" stroke="hsl(230 60% 68% / 0.08)" strokeWidth="1.5" />

        {/* Outer arc — clockwise, slowest — rotated via <g> so origin is always (50,50) */}
        <g className="page-loader-arc-outer">
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            strokeWidth="3.5"
            stroke="hsl(250 65% 55%)"
            strokeLinecap="round"
            strokeDasharray="172 80"
          />
        </g>

        {/* Middle arc — counter-clockwise, medium */}
        <g className="page-loader-arc-middle">
          <circle
            cx="50" cy="50" r="27"
            fill="none"
            strokeWidth="3"
            stroke="hsl(280 70% 62%)"
            strokeLinecap="round"
            strokeDasharray="108 62"
          />
        </g>

        {/* Inner arc — clockwise, fastest */}
        <g className="page-loader-arc-inner">
          <circle
            cx="50" cy="50" r="15"
            fill="none"
            strokeWidth="2.5"
            stroke="hsl(230 60% 72%)"
            strokeLinecap="round"
            strokeDasharray="52 42"
          />
        </g>

        {/* Pulsing center dot */}
        <circle cx="50" cy="50" r="5" fill="hsl(250 65% 55%)" className="page-loader-center" />
      </svg>

      {/* "Loading" text with animated dots */}
      <p className="page-loader-label" aria-live="polite">
        Loading
        <span className="page-loader-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    </div>
  );
}

/**
 * Watches for route changes and shows the spinner ONLY when a page transition
 * takes longer than 300 ms. Fast navigations (<300 ms) never show any spinner.
 */
export function PageTransitionLoader() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const showKey = useRef(0);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === prevPath.current) return;
    prevPath.current = location.pathname;

    setVisible(false); // reset any previous spinner

    // Only show after 300 ms — fast pages never trigger it
    const showTimer = setTimeout(() => {
      showKey.current += 1;
      setVisible(true);
    }, 300);

    // Cap at 2 s even for very slow pages
    const hideTimer = setTimeout(() => setVisible(false), 2000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div key={showKey.current} className="page-loader-overlay" aria-label="Loading page">
      <OrbitSpinner />
    </div>
  );
}
