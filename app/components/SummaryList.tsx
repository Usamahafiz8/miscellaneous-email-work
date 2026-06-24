"use client";

import type { EmailSummary } from "@/lib/types";
import SummaryCard from "./SummaryCard";

interface SummaryListProps {
  summaries: EmailSummary[];
}

export default function SummaryList({ summaries }: SummaryListProps) {
  if (summaries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-sm font-medium">No summaries yet</p>
        <p className="text-xs mt-1">Enter your email credentials and click Fetch & Summarize</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {summaries.map((s) => (
        <SummaryCard key={s.emailId} summary={s} />
      ))}
    </div>
  );
}
