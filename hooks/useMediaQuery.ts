"use client";

import { useState, useEffect } from "react";

// SSR-safe media query hook. Always returns `false` on the server and on the
// very first client render (so markup matches and React doesn't hydration-warn),
// then flips to the real value in an effect.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Tailwind's `md` breakpoint — the point at which split views stop stacking and
// start showing the list and the detail pane side by side.
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
