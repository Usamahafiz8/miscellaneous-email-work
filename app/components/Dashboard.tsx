"use client";

import { useState, useCallback, useMemo } from "react";
import type { EmailSummary, EmailStatus, NavView } from "@/lib/types";
import Sidebar from "./Sidebar";
import DashboardHome from "./DashboardHome";
import InboxView from "./InboxView";
import HiringView from "./HiringView";
import AnalyticsView from "./AnalyticsView";
import ErrorAlert from "./ErrorAlert";

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState<NavView>("home");
  const [summaries, setSummaries] = useState<EmailSummary[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Map<string, EmailStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const fetchEmails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email/process", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to fetch emails");
      setSummaries(data.summaries ?? []);
      setStatusOverrides(new Map()); // reset statuses on fresh fetch
      setLastFetched(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleStatusChange = useCallback((emailId: string, status: EmailStatus) => {
    setStatusOverrides((prev) => new Map(prev).set(emailId, status));
  }, []);

  const enriched = useMemo(
    () => summaries.map((s) => ({ ...s, status: statusOverrides.get(s.emailId) ?? s.status })),
    [summaries, statusOverrides]
  );

  const hiringEmails = useMemo(() => enriched.filter((s) => s.category === "Hiring"), [enriched]);

  return (
    <div className="flex h-screen bg-[#0f172a] overflow-hidden">
      <Sidebar
        active={activeNav}
        onChange={setActiveNav}
        emailCount={enriched.length}
        hiringCount={hiringEmails.length}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-hidden rounded-l-2xl">
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
              isLoading={isLoading}
              lastFetched={lastFetched}
              onFetch={fetchEmails}
              onNavigate={setActiveNav}
            />
          )}
          {activeNav === "inbox" && (
            <InboxView
              summaries={enriched}
              isLoading={isLoading}
              onFetch={fetchEmails}
              onStatusChange={handleStatusChange}
            />
          )}
          {activeNav === "hiring" && (
            <HiringView
              summaries={hiringEmails}
              isLoading={isLoading}
              onFetch={fetchEmails}
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
