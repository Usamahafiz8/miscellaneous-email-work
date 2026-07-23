"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

// "comfortable" = the roomy default. "compact" shaves ~40% off every row's
// vertical padding and drops font sizes a notch, so roughly half again as many
// emails/candidates fit on screen without scrolling. Implemented as CSS custom
// properties on the app root (see globals.css) rather than per-component props,
// so a single attribute flip restyles every table, toolbar, and list at once.
export type Density = "comfortable" | "compact";

interface UIPrefsValue {
  density: Density;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;
  // Focus mode hides the top navigation bar entirely and hands those ~48px back
  // to the content. Exiting is always possible via Esc, the floating pill, or ⌘K.
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  toggleFocusMode: () => void;
  // True once the persisted values have been read from localStorage. Components
  // that would otherwise flash the default (e.g. a saved split width) can wait
  // on this instead of rendering the wrong layout for one frame.
  hydrated: boolean;
}

const UIPrefsContext = createContext<UIPrefsValue | null>(null);

export function useUIPrefs(): UIPrefsValue {
  const ctx = useContext(UIPrefsContext);
  if (!ctx) throw new Error("useUIPrefs must be used within UIPrefsProvider");
  return ctx;
}

const DENSITY_KEY = "ui:density";
const FOCUS_KEY = "ui:focusMode";

export default function UIPrefsProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>("comfortable");
  const [focusMode, setFocusModeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted prefs after mount rather than during render — reading
  // localStorage on the server isn't possible, and doing it in a lazy useState
  // initializer would desync server and client markup.
  useEffect(() => {
    try {
      const d = window.localStorage.getItem(DENSITY_KEY);
      if (d === "compact" || d === "comfortable") setDensityState(d);
      setFocusModeState(window.localStorage.getItem(FOCUS_KEY) === "1");
    } catch { /* private mode / storage disabled — keep defaults */ }
    setHydrated(true);
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try { window.localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ }
  }, []);

  const setFocusMode = useCallback((v: boolean) => {
    setFocusModeState(v);
    try { window.localStorage.setItem(FOCUS_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  const toggleDensity = useCallback(
    () => setDensity(density === "compact" ? "comfortable" : "compact"),
    [density, setDensity]
  );
  const toggleFocusMode = useCallback(() => setFocusMode(!focusMode), [focusMode, setFocusMode]);

  const value = useMemo<UIPrefsValue>(
    () => ({ density, setDensity, toggleDensity, focusMode, setFocusMode, toggleFocusMode, hydrated }),
    [density, setDensity, toggleDensity, focusMode, setFocusMode, toggleFocusMode, hydrated]
  );

  return <UIPrefsContext.Provider value={value}>{children}</UIPrefsContext.Provider>;
}
