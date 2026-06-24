"use client";

import { useState, useEffect, useCallback } from "react";
import type { EmailSummary } from "@/lib/types";

interface CacheStatus {
  summaries: EmailSummary[];
  total: number;
  cacheAge: number | null;
  isLoading: boolean;
}

export function useCacheStatus(autoFetch = false) {
  const [status, setStatus] = useState<CacheStatus>({
    summaries: [],
    total: 0,
    cacheAge: null,
    isLoading: false,
  });

  const fetch = useCallback(async () => {
    setStatus((prev) => ({ ...prev, isLoading: true }));
    try {
      const res = await globalThis.fetch("/api/summaries?limit=100&offset=0");
      if (!res.ok) return;
      const data = await res.json();
      setStatus({
        summaries: data.summaries ?? [],
        total: data.total ?? 0,
        cacheAge: data.cacheAge ?? null,
        isLoading: false,
      });
    } catch {
      setStatus((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const clearCache = useCallback(async () => {
    await globalThis.fetch("/api/summaries", { method: "DELETE" });
    setStatus({ summaries: [], total: 0, cacheAge: null, isLoading: false });
  }, []);

  useEffect(() => {
    if (autoFetch) fetch();
  }, [autoFetch, fetch]);

  return { ...status, refetch: fetch, clearCache };
}
