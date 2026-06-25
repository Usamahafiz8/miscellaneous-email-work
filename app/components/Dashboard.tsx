"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import type { EmailSummary, EmailStatus, NavView } from "@/lib/types";
import Sidebar from "./Sidebar";
import DashboardHome from "./DashboardHome";
import InboxView from "./InboxView";
import HiringView from "./HiringView";
import AnalyticsView from "./AnalyticsView";
import ErrorAlert from "./ErrorAlert";

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState<NavView>("inbox");
  const [summaries, setSummaries] = useState<EmailSummary[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Map<string, EmailStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Load from DB (no IMAP, no AI) — used on mount and for "load more"
  const loadFromDB = useCallback(async (offset = 0) => {
    const isFirstPage = offset === 0;
    if (isFirstPage) setIsLoading(true);
    else setIsLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(`/api/email/process?offset=${offset}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to load emails");

      const incoming: EmailSummary[] = data.summaries ?? [];
      if (isFirstPage) {
        setSummaries(incoming);
        setStatusOverrides(new Map());
      } else {
        setSummaries((prev) => {
          const seen = new Set(prev.map((s) => s.emailId));
          return [...prev, ...incoming.filter((s) => !seen.has(s.emailId))];
        });
      }
      setTotalCount(data.totalCount ?? 0);
      setNextOffset(offset + incoming.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Sync from IMAP — runs AI only for emails not in DB yet
  const syncEmails = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/email/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: 0 }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to sync emails");

      const incoming: EmailSummary[] = data.summaries ?? [];
      setSummaries(incoming);
      setStatusOverrides(new Map());
      setTotalCount(data.totalCount ?? 0);
      setNextOffset(incoming.length);
      setLastFetched(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

      const newCount: number = data.newCount ?? 0;
      setSyncMessage(
        newCount > 0
          ? `${newCount} new email${newCount === 1 ? "" : "s"} found and summarized`
          : "Already up to date — no new emails"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Load cached emails on mount
  useEffect(() => { loadFromDB(0); }, [loadFromDB]);

  const loadMore = useCallback(() => loadFromDB(nextOffset), [loadFromDB, nextOffset]);

  const handleStatusChange = useCallback((emailId: string, status: EmailStatus) => {
    setStatusOverrides((prev) => new Map(prev).set(emailId, status));
  }, []);

  const enriched = useMemo(
    () => summaries.map((s) => ({ ...s, status: statusOverrides.get(s.emailId) ?? s.status })),
    [summaries, statusOverrides]
  );

  const hiringEmails = useMemo(() => enriched.filter((s) => s.category === "Hiring"), [enriched]);
  const unreadCount = useMemo(() => enriched.filter((s) => s.status === "New").length, [enriched]);
  const hasMore = totalCount > 0 && enriched.length < totalCount;

  return (
    <div className="flex h-screen bg-[#0f172a] overflow-hidden font-sans">
      <Sidebar
        active={activeNav}
        onChange={setActiveNav}
        emailCount={enriched.length}
        unreadCount={unreadCount}
        hiringCount={hiringEmails.length}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        onCompose={() => setActiveNav("inbox")}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        {/* Sync feedback banner */}
        {syncMessage && (
          <div className="px-6 pt-4 flex-shrink-0">
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm rounded-lg px-4 py-2">
              <span>{syncMessage}</span>
              <button onClick={() => setSyncMessage(null)} className="ml-4 text-indigo-400 hover:text-indigo-600">✕</button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="px-6 pt-4 flex-shrink-0">
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* View */}
        <div className="flex-1 overflow-hidden">
          {activeNav === "home" && (
            <DashboardHome
              summaries={enriched}
              isLoading={isLoading || isSyncing}
              lastFetched={lastFetched}
              onFetch={syncEmails}
              onNavigate={setActiveNav}
            />
          )}
          {activeNav === "inbox" && (
            <InboxView
              summaries={enriched}
              isLoading={isLoading || isSyncing}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              totalCount={totalCount}
              onFetch={syncEmails}
              onLoadMore={loadMore}
              onStatusChange={handleStatusChange}
            />
          )}
          {activeNav === "hiring" && (
            <HiringView
              summaries={hiringEmails}
              isLoading={isLoading || isSyncing}
              onFetch={syncEmails}
            />
          )}
          {activeNav === "analytics" && (
            <AnalyticsView summaries={enriched} />
          )}
        </div>
      </div>
    </div>
  );
}
