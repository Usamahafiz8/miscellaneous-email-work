"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { EmailSummary, EmailStatus, Stage } from "@/lib/types";
import type { Toast, ToastKind } from "./ui/Toaster";
import UIPrefsProvider from "./UIPrefsProvider";
import AppChrome from "./AppChrome";

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
  // Status messages render as a bottom-right toast stack (see AppChrome), not as
  // inline banners — the old banners sat above the view and pushed every row
  // down the moment a sync started, costing vertical space and shifting content
  // mid-read. Views raise their own messages through `notify`.
  toasts: Toast[];
  notify: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
  syncEmails: () => Promise<void>;
  clearAndResync: () => Promise<void>;
  // Pages through the ENTIRE mailbox (offset 0, 50, 100, …) storing every email,
  // then summarizes — for a full backfill, not just the newest page.
  fetchAllEmails: () => Promise<void>;
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
  // Distinct AI-extracted skills across all candidates, for the skills filter's option list
  // — fetched once on mount, never refreshed after (skills aren't user-editable, unlike tags).
  availableSkills: string[];
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

// A 401 from any API call means the session cookie expired or was cleared —
// bounce to the login page (hard nav so the (dash) server guard re-runs).
function redirectToLoginIfUnauthorized(res: Response): boolean {
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    return true;
  }
  return false;
}

export default function DashboardProvider({
  children,
  accountEmail,
}: {
  children: React.ReactNode;
  accountEmail: string;
}) {
  const [counts, setCounts] = useState<Counts>({ total: 0, unread: 0, hiring: 0, stageCounts: {} });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);

  // ── Toasts ────────────────────────────────────────────────────────────────
  // Sync progress and errors reuse fixed ids ("sync"/"error") so a long import
  // updates one toast in place ("120/900 scanned…") instead of stacking a new
  // one per batch. Ad-hoc messages from views get a counter-based id.
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const upsertToast = useCallback((toast: Toast) => {
    setToasts((prev) => {
      const i = prev.findIndex((t) => t.id === toast.id);
      if (i === -1) return [...prev, toast];
      const next = [...prev];
      next[i] = toast;
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    upsertToast({ id: `n${++toastSeq.current}`, kind, message });
  }, [upsertToast]);

  // Sticky while work is in flight (a timed dismiss would hide the status
  // halfway through a multi-minute import); auto-dismissing once it's done.
  const setSyncMessage = useCallback((message: string | null, done = false) => {
    if (message === null) { dismissToast("sync"); return; }
    upsertToast({ id: "sync", kind: done ? "success" : "progress", message, sticky: !done });
  }, [upsertToast, dismissToast]);

  const setError = useCallback((message: string | null) => {
    if (message === null) { dismissToast("error"); return; }
    upsertToast({ id: "error", kind: "error", message });
  }, [upsertToast, dismissToast]);

  const [overviewSummaries, setOverviewSummaries] = useState<EmailSummary[]>([]);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const overviewFetchedRef = useRef(false);

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);

  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Map<string, EmailSummary>>(new Map());
  const detailFetchedRef = useRef<Set<string>>(new Set());

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/summaries/counts");
      if (redirectToLoginIfUnauthorized(res)) return;
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

  const refreshSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/summaries/skills");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setAvailableSkills(data.skills ?? []);
    } catch { /* keep last known skills on failure */ }
  }, []);

  const refreshOverview = useCallback(async () => {
    overviewFetchedRef.current = true;
    setIsOverviewLoading(true);
    try {
      const res = await fetch(`/api/email/process?page=1&pageSize=${OVERVIEW_PAGE_SIZE}&sortBy=date&sortOrder=desc`);
      if (redirectToLoginIfUnauthorized(res)) return;
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

  // Large imports/backfills page through the mailbox in dozens of small batches
  // (see summarizePending/pageThroughMailbox below), and used to refresh sidebar
  // counts + the dashboard overview after every single one — for a 1,000-email
  // import that's dozens of redundant round-trips. This throttles those refreshes
  // to at most once every REFRESH_THROTTLE_MS, while `force` (used on the final
  // batch) always goes through, so the UI still ends up fully accurate.
  // Low enough that rows visibly stream in as each summarize batch lands (a
  // batch is now ~one AI call, not a sum of them), high enough that a 50-page
  // import doesn't fire a refresh per page.
  const REFRESH_THROTTLE_MS = 1000;
  const lastRefreshAtRef = useRef(0);
  const throttledRefresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) return;
    lastRefreshAtRef.current = now;
    setSyncVersion((v) => v + 1);
    await Promise.all([refreshCounts(), refreshOverview()]);
  }, [refreshCounts, refreshOverview]);

  useEffect(() => {
    refreshCounts();
    refreshTags();
    refreshSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Summarize raw (pending) emails in bounded batches until none remain, refreshing
  // views after each batch so the list fills in with real AI data progressively.
  // Returns the total number summarized. Throws on a failed batch.
  const summarizePending = useCallback(async (label: string): Promise<number> => {
    let done = 0;
    // Hard cap on iterations as an infinite-loop backstop (BATCH=10 server-side,
    // so this covers thousands of emails) in case `remaining` never reaches 0.
    for (let i = 0; i < 1000; i++) {
      const res = await fetch("/api/email/summarize-pending", { method: "POST" });
      if (redirectToLoginIfUnauthorized(res)) return done;
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to summarize pending emails");

      done += data.summarized ?? 0;
      const isDone = (data.summarized ?? 0) === 0 || (data.remaining ?? 0) === 0;
      await throttledRefresh(isDone); // force a real refresh on the final batch

      if (isDone) break;
      setSyncMessage(`${label} ${done} summarized, ${data.remaining} remaining…`);
    }
    return done;
  }, [throttledRefresh, setSyncMessage]);

  // Sync from IMAP: fetch the newest mail as raw rows (fast, no AI), then
  // summarize any pending emails (this fetch + any earlier backlog) in batches so
  // the list fills in with real AI summaries instead of staying blank.
  const syncEmails = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      // Phase 1 — fetch & store raw (no LLM, returns immediately).
      const res = await fetch("/api/email/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: 0 }),
      });
      if (redirectToLoginIfUnauthorized(res)) return;
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to sync emails");

      const newCount = data.newCount ?? 0;
      setSyncVersion((v) => v + 1);
      await Promise.all([refreshCounts(), refreshOverview()]);
      setSyncMessage(newCount > 0 ? `${newCount} new email${newCount === 1 ? "" : "s"} fetched — summarizing…` : "Summarizing pending emails…");

      // Phase 2 — summarize pending (newly fetched + any backlog).
      const summarized = await summarizePending("Summarizing…");

      setLastFetched(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setSyncMessage(
        newCount > 0
          ? `${newCount} new email${newCount === 1 ? "" : "s"} synced${summarized > 0 ? ` · ${summarized} summarized` : ""}`
          : summarized > 0
            ? `${summarized} email${summarized === 1 ? "" : "s"} summarized`
            : "Already up to date — no new emails",
        true
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCounts, refreshOverview, summarizePending, setSyncMessage, setError]);

  // Page through the ENTIRE mailbox (offset 0, 50, 100, …) storing every message
  // as a raw row. Returns total new emails stored. Shared by Fetch All & Re-sync.
  const pageThroughMailbox = useCallback(async (label: string): Promise<number> => {
    let offset = 0;
    let totalNew = 0;
    let totalCount = 0;
    // Safety cap: 1000 pages (server PAGE_SIZE 50 → up to 50k messages).
    for (let i = 0; i < 1000; i++) {
      const res = await fetch("/api/email/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset }),
      });
      if (redirectToLoginIfUnauthorized(res)) return totalNew;
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to fetch emails");

      totalNew += data.newCount ?? 0;
      totalCount = data.totalCount ?? 0;
      const fetched = data.fetched ?? 0;
      offset += fetched;
      const isDone = fetched === 0 || offset >= totalCount;
      await throttledRefresh(isDone); // force a real refresh on the final batch
      setSyncMessage(`${label} ${Math.min(offset, totalCount)}/${totalCount} scanned, ${totalNew} new`);

      if (isDone) break;
    }
    return totalNew;
  }, [throttledRefresh, setSyncMessage]);

  // Clear the DB, then re-import the WHOLE mailbox and re-summarize from scratch —
  // a clean full rebuild (also the way to purge legacy duplicate rows).
  const clearAndResync = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const del = await fetch("/api/summaries", { method: "DELETE" });
      if (redirectToLoginIfUnauthorized(del)) return;
      if (!del.ok) throw new Error("Failed to clear summaries");
      setSyncVersion((v) => v + 1);
      await Promise.all([refreshCounts(), refreshOverview()]);

      const totalNew = await pageThroughMailbox("Re-importing all mail…");
      setSyncMessage(`Re-fetched ${totalNew} email${totalNew === 1 ? "" : "s"} — summarizing…`);
      const summarized = await summarizePending("Re-syncing…");

      setLastFetched(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setSyncMessage(`Re-synced ${summarized} email${summarized !== 1 ? "s" : ""} with fresh AI summaries`, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCounts, refreshOverview, pageThroughMailbox, summarizePending, setSyncMessage, setError]);

  // Import the WHOLE mailbox (without clearing) and summarize all pending — for a
  // full backfill on top of whatever is already stored.
  const fetchAllEmails = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const totalNew = await pageThroughMailbox("Importing all mail…");
      setSyncMessage(`Imported ${totalNew} new email${totalNew === 1 ? "" : "s"} — summarizing…`);
      const summarized = await summarizePending("Summarizing…");

      setLastFetched(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setSyncMessage(
        `Imported all mail — ${totalNew} new email${totalNew === 1 ? "" : "s"}${summarized > 0 ? ` · ${summarized} summarized` : ""}`,
        true
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSyncing(false);
    }
  }, [pageThroughMailbox, summarizePending, setSyncMessage, setError]);

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
        if (redirectToLoginIfUnauthorized(res)) return;
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !data.summary) {
          detailFetchedRef.current.delete(emailId);
          return;
        }

        let summary: EmailSummary = data.summary;
        // Lazy AI summarization: raw-synced emails arrive with summarized=false and
        // empty AI fields. Run the LLM on this one email the first time it's opened
        // (reusing the resync route), then cache the filled-in result.
        if (summary.summarized === false) {
          const sres = await fetch("/api/email/resync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailId }),
          });
          const sdata = await sres.json().catch(() => null);
          if (sres.ok && sdata?.success && sdata.summary) {
            summary = { ...sdata.summary, summarized: true };
            // Category/priority/hiring fields just materialized — refresh the badges.
            refreshCounts();
          } else {
            // Summarization failed: allow a later retry rather than caching the miss.
            detailFetchedRef.current.delete(emailId);
          }
        }

        setDetailCache((prev) => new Map(prev).set(emailId, summary));
      } catch {
        detailFetchedRef.current.delete(emailId);
      } finally {
        setLoadingDetailId((id) => (id === emailId ? null : id));
      }
    })();
  }, [refreshCounts]);

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

  const contextValue = useMemo<DashboardContextValue>(() => ({
    counts, isSyncing, lastFetched, toasts, notify, dismissToast,
    syncEmails, clearAndResync, fetchAllEmails, syncVersion, overviewSummaries, isOverviewLoading, loadOverviewIfNeeded,
    loadingDetailId, loadEmailDetail, getEmailDetail, availableTags, availableSkills, patchEmail,
  }), [
    counts, isSyncing, lastFetched, toasts, notify, dismissToast,
    syncEmails, clearAndResync, fetchAllEmails, syncVersion, overviewSummaries, isOverviewLoading, loadOverviewIfNeeded,
    loadingDetailId, loadEmailDetail, getEmailDetail, availableTags, availableSkills, patchEmail,
  ]);

  // AppChrome (top bar, command palette, shortcuts, toasts) renders *inside*
  // the context provider so it can read sync state and run dashboard actions —
  // the ⌘K palette offers "Sync inbox", "Import entire mailbox", and so on.
  return (
    <UIPrefsProvider>
      <DashboardContext.Provider value={contextValue}>
        <AppChrome accountEmail={accountEmail} onLogout={logout}>
          {children}
        </AppChrome>
      </DashboardContext.Provider>
    </UIPrefsProvider>
  );
}
