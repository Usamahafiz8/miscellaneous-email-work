"use client";

import { useEffect } from "react";
import { useDashboard } from "@/app/components/DashboardProvider";
import DashboardHome from "@/app/components/DashboardHome";

export default function Home() {
  const { overviewSummaries, isOverviewLoading, isSyncing, lastFetched, syncEmails, loadOverviewIfNeeded } = useDashboard();

  // Lazy — only fetches the (fairly heavy, unfiltered) overview dataset once
  // Home is actually visited, instead of on every app load regardless of page.
  useEffect(() => { loadOverviewIfNeeded(); }, [loadOverviewIfNeeded]);

  return (
    <DashboardHome
      summaries={overviewSummaries}
      isLoading={isOverviewLoading || isSyncing}
      lastFetched={lastFetched}
      onFetch={syncEmails}
    />
  );
}
