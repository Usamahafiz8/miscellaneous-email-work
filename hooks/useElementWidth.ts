"use client";

import { useState, useEffect, useRef, type RefObject } from "react";

// Measures the live width of an element via ResizeObserver. Used by the reading
// panes to decide whether there's room to show AI insights and the original
// email side by side rather than one-at-a-time behind tabs — a decision that
// depends on the *pane's* width (which the user can drag), not the viewport's,
// so a plain media query wouldn't do.
export function useElementWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
