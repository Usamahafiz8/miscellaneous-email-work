"use client";

import { useState, useEffect, useCallback } from "react";

// useState that survives reloads by mirroring to localStorage. The stored value
// is read after mount rather than in a lazy initializer, because localStorage
// isn't readable during SSR and reading it during render would desync the
// server and client markup.
export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch { /* storage disabled or corrupt entry — keep the default */ }
  }, [key]);

  const set = useCallback((next: T) => {
    setValue(next);
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  }, [key]);

  return [value, set];
}
