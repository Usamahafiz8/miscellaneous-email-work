"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { EmailSummary, EmailStatus, Stage } from "@/lib/types";
import TopBar from "./TopBar";
import ErrorAlert from "./ErrorAlert";

// Bounded fetch backing Dashboard/Home's stat cards & charts. Not a true
// full-dataset aggregate (that would need a dedicated GROUP BY endpoint) but
// comfortably covers realistic recent-activity windows without unbounded growth.
const OVERVIEW_PAGE_SIZE = 300;

interface Counts {
  total: number;
  unread: number;
  hiring: number;
  stageCounts: Record<string, number>;
}

export interface EmailPatch {
  status?: EmailStatus;
  stage?: Stage;
  tags?: string[];
}

interface DashboardContextValue {
  // Sidebar badges — always accurate across the whole dataset (cheap COUNT queries),
  // unlike deriving counts from whatever page a view happens to have loaded.
  counts: Counts;
  isSyncing: boolean;
  lastFetched: string | null;
  syncMessage: string | null;
  dismissSyncMessage: () => void;
  error: string | null;
  dismissError: () => void;
  syncEmails: () => Promise<void>;
  clearAndResync: () => Promise<void>;
  // Bumped every time a sync batch lands — views depend on this to know when to refetch their page.
  syncVersion: number;
  // Home's recent-activity dataset (bounded, see OVERVIEW_PAGE_SIZE). Lazily
  // loaded — only fetched once something actually reads it (Home calls this on
  // mount if empty), so landing on Inbox/Hiring/Candidates doesn't pay for it.
  overviewSummaries: EmailSummary[];
  isOverviewLoading: boolean;
  loadOverviewIfNeeded: () => void;
  // Shared lazy full-detail fetch (body/htmlBody/attachments) for the slide-over panels.
  loadingDetailId: string | null;
  loadEmailDetail: (emailId: string) => void;
  getEmailDetail: (emailId: string) => EmailSummary | undefined;
  // Distinct tags in use, for tag-input autocomplete — fetched once, refreshed after a tag edit.
  availableTags: string[];
  // Persists a status/stage/tags change + keeps the detail cache consistent + refreshes
  // sidebar counts (and available tags, if tags changed). Callers are responsible for
  // optimistically updating their own local row state.
  patchEmail: (emailId: string, updates: EmailPatch) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}

export default function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Counts>({ total: 0, unread: 0, hiring: 0, stageCounts: {} });
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);

  const [overviewSummaries, setOverviewSummaries] = useState<EmailSummary[]>([]);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const overviewFetchedRef = useRef(false);

  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Map<string, EmailSummary>>(new Map());
  const detailFetchedRef = useRef<Set<string>>(new Set());

  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/summaries/counts");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setCounts({ total: data.total, unread: data.unread, hiring: data.hiring, stageCounts: data.stageCounts ?? {} });
      }
    } catch { /* keep last known counts on failure */ }
  }, []);

  const refreshTags = useCallback(async () => {
    try {
      const res = await fetch("/api/summaries/tags");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setAvailableTags(data.tags ?? []);
    } catch { /* keep last known tags on failure */ }
  }, []);

  const refreshOverview = useCallback(async () => {
    overviewFetchedRef.current = true;
    setIsOverviewLoading(true);
    try {
      const res = await fetch(`/api/email/process?page=1&pageSize=${OVERVIEW_PAGE_SIZE}&sortBy=date&sortOrder=desc`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setOverviewSummaries(data.summaries ?? []);
    } catch { /* keep last known overview on failure */ }
    finally { setIsOverviewLoading(false); }
  }, []);

  // Called by Home on mount — skips the fetch if it's already been loaded this
  // session (e.g. a prior visit to Home, or a sync already refreshed it).
  const loadOverviewIfNeeded = useCallback(() => {
    if (overviewFetchedRef.current) return;
    refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    refreshCounts();
    refreshTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync from IMAP — runs AI only for emails not in DB yet. Loops until all new
  // emails are summarized (server caps each call to stay under timeout).
  const syncEmails = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    let totalNew = 0;
    try {
      let pendingCount = 1;
      while (pendingCount > 0) {
        const res = await fetch("/api/email/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset: 0 }),
        });
        const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
        if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to sync emails");

        totalNew += data.newCount ?? 0;
        pendingCount = data.pendingCount ?? 0;
        setSyncVersion((v) => v + 1);
        await Promise.all([refreshCounts(), refreshOverview()]);

        if (pendingCount > 0) {
          setSyncMessage(`Summarized ${totalNew} emails so far, ${pendingCount} remaining…`);
        }
      }

      setLastFetched(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setSyncMessage(
        totalNew > 0
          ? `${totalNew} new email${totalNew === 1 ? "" : "s"} found and summarized`
          : "Already up to date — no new emails"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCounts, refreshOverview]);

  // Clear DB then re-sync everything in batches (avoids 504 on large mailboxes)
  const clearAndResync = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    let totalNew = 0;
    try {
      const del = await fetch("/api/summaries", { method: "DELETE" });
      if (!del.ok) throw new Error("Failed to clear summaries");
      setSyncVersion((v) => v + 1);
      await Promise.all([refreshCounts(), refreshOverview()]);

      let pendingCount = 1;
      while (pendingCount > 0) {
        const res = await fetch("/api/email/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset: 0 }),
        });
        const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
        if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to sync emails");

        totalNew += data.newCount ?? 0;
        pendingCount = data.pendingCount ?? 0;
        setSyncVersion((v) => v + 1);
        await Promise.all([refreshCounts(), refreshOverview()]);

        if (pendingCount > 0) {
          setSyncMessage(`Re-syncing… ${totalNew} done, ${pendingCount} remaining`);
        }
      }

      setLastFetched(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setSyncMessage(`Re-synced ${totalNew} email${totalNew !== 1 ? "s" : ""} with fresh AI summaries`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCounts, refreshOverview]);

  // List rows omit body/htmlBody/attachments to keep page payloads light — fetch
  // the full content for one email the moment its detail pane is opened, caching
  // by emailId so re-opening the same row doesn't refetch.
  const loadEmailDetail = useCallback((emailId: string) => {
    if (detailFetchedRef.current.has(emailId)) return;
    detailFetchedRef.current.add(emailId);
    setLoadingDetailId(emailId);
    (async () => {
      try {
        const res = await fetch(`/api/summaries/${encodeURIComponent(emailId)}`);
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data.summary) {
          setDetailCache((prev) => new Map(prev).set(emailId, data.summary));
        } else {
          detailFetchedRef.current.delete(emailId);
        }
      } catch {
        detailFetchedRef.current.delete(emailId);
      } finally {
        setLoadingDetailId((id) => (id === emailId ? null : id));
      }
    })();
  }, []);

  const getEmailDetail = useCallback((emailId: string) => detailCache.get(emailId), [detailCache]);

  const patchEmail = useCallback(async (emailId: string, updates: EmailPatch) => {
    setDetailCache((prev) => {
      if (!prev.has(emailId)) return prev;
      const next = new Map(prev);
      next.set(emailId, { ...next.get(emailId)!, ...updates });
      return next;
    });
    try {
      await fetch("/api/summaries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, ...updates }),
      });
    } finally {
      refreshCounts();
      if (updates.tags !== undefined) refreshTags();
    }
  }, [refreshCounts, refreshTags]);

  const dismissSyncMessage = useCallback(() => setSyncMessage(null), []);
  const dismissError = useCallback(() => setError(null), []);

  const contextValue = useMemo<DashboardContextValue>(() => ({
    counts, isSyncing, lastFetched, syncMessage, dismissSyncMessage, error, dismissError,
    syncEmails, clearAndResync, syncVersion, overviewSummaries, isOverviewLoading, loadOverviewIfNeeded,
    loadingDetailId, loadEmailDetail, getEmailDetail, availableTags, patchEmail,
  }), [
    counts, isSyncing, lastFetched, syncMessage, dismissSyncMessage, error, dismissError,
    syncEmails, clearAndResync, syncVersion, overviewSummaries, isOverviewLoading, loadOverviewIfNeeded,
    loadingDetailId, loadEmailDetail, getEmailDetail, availableTags, patchEmail,
  ]);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden font-sans">
      <TopBar emailCount={counts.total} unreadCount={counts.unread} hiringCount={counts.hiring} />

      {/* Sync feedback banner */}
      {syncMessage && (
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm rounded-lg px-4 py-2">
            <span>{syncMessage}</span>
            <button onClick={dismissSyncMessage} className="ml-4 text-indigo-400 hover:text-indigo-600">✕</button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-6 pt-4 flex-shrink-0">
          <ErrorAlert message={error} onDismiss={dismissError} />
        </div>
      )}

      {/* View */}
      <div className="flex-1 overflow-hidden">
        <DashboardContext.Provider value={contextValue}>
          {children}
        </DashboardContext.Provider>
      </div>
    </div>
  );
}
