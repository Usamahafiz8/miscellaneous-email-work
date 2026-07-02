"use client";

import { useState, useCallback, useEffect } from "react";

export interface FilterPreset<T> {
  name: string;
  filters: T;
  createdAt: string;
}

// Backed by localStorage — this app has no auth/User table, so presets are a
// per-browser convenience, not a synced server-side setting.
export function useFilterPresets<T>(storageKey: string) {
  const [presets, setPresets] = useState<FilterPreset<T>[]>([]);

  // Loaded in an effect rather than a lazy useState initializer so the first
  // client render matches the server-rendered empty state — avoids a
  // hydration mismatch on the "Presets (N)" count label.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setPresets(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPresets([]);
    }
  }, [storageKey]);

  const savePreset = useCallback((name: string, filters: T) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPresets((prev) => {
      const next = [...prev.filter((p) => p.name !== trimmed), { name: trimmed, filters, createdAt: new Date().toISOString() }];
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota/private-mode — best effort */ }
      return next;
    });
  }, [storageKey]);

  const deletePreset = useCallback((name: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.name !== name);
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  return { presets, savePreset, deletePreset };
}
