import type { EmailSummary } from "./types";

interface CacheEntry {
  summaries: EmailSummary[];
  storedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

// Module-level in-memory cache (persists across requests in same server process)
const store: CacheEntry = {
  summaries: [],
  storedAt: 0,
};

export function getCachedSummaries(limit: number, offset: number) {
  const summaries = [...store.summaries];
  return {
    summaries: summaries.slice(offset, offset + limit),
    total: summaries.length,
    limit,
    offset,
  };
}

export function cacheSummaries(summaries: EmailSummary[]): void {
  const now = Date.now();

  // Evict if cache is older than TTL
  if (now - store.storedAt > TTL_MS) {
    store.summaries = [];
  }

  // Upsert by emailId to avoid duplicates
  const existing = new Map(store.summaries.map((s) => [s.emailId, s]));
  for (const s of summaries) {
    existing.set(s.emailId, { ...s, fetchedAt: new Date().toISOString() });
  }

  store.summaries = Array.from(existing.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  store.storedAt = now;
}

export function clearCache(): void {
  store.summaries = [];
  store.storedAt = 0;
}

export function getCacheAge(): number | null {
  if (store.storedAt === 0) return null;
  return Date.now() - store.storedAt;
}
