"use client";

import type { EmailSummary, NavView, Priority, Category } from "@/lib/types";

interface DashboardHomeProps {
  summaries: EmailSummary[];
  isLoading: boolean;
  lastFetched: string | null;
  onFetch: () => void;
  onNavigate: (v: NavView) => void;
}

const PRIORITY_COLOR: Record<Priority, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-400",
  Medium: "bg-yellow-400",
  Low: "bg-green-400",
};

const CATEGORY_COLOR: Record<Category, string> = {
  Hiring: "text-violet-600 bg-violet-50",
  "Client Support": "text-blue-600 bg-blue-50",
  Sales: "text-emerald-600 bg-emerald-50",
  Finance: "text-green-700 bg-green-50",
  Internal: "text-gray-600 bg-gray-100",
  Marketing: "text-pink-600 bg-pink-50",
  Technical: "text-indigo-600 bg-indigo-50",
  General: "text-slate-600 bg-slate-100",
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

function StatCard({ label, value, sub, color, icon }: { label: string; value: number; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardHome({ summaries, isLoading, lastFetched, onFetch, onNavigate }: DashboardHomeProps) {
  const stats = {
    total: summaries.length,
    actionRequired: summaries.filter(s => s.actionRequired === "Yes").length,
    hiring: summaries.filter(s => s.category === "Hiring").length,
    highPriority: summaries.filter(s => s.priority === "Critical" || s.priority === "High").length,
    newEmails: summaries.filter(s => s.status === "New").length,
  };

  // Category breakdown
  const byCategory = summaries.reduce<Partial<Record<Category, number>>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});
  const sortedCategories = (Object.entries(byCategory) as [Category, number][])
    .sort((a, b) => b[1] - a[1]);

  const recent = [...summaries].slice(0, 6);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#f8fafc]">
      {/* Page header */}
      <div className="px-8 py-6 bg-white border-b border-gray-100">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{greeting} 👋</h1>
            <p className="text-sm text-gray-500 mt-1">
              {now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastFetched && <span className="text-xs text-gray-400">Last synced at {lastFetched}</span>}
            <button
              onClick={onFetch}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {isLoading ? "Syncing…" : summaries.length > 0 ? "Sync Inbox" : "Fetch Emails"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Empty state */}
        {!isLoading && summaries.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#667eea]/10 to-[#764ba2]/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#667eea]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">No emails synced yet</h3>
            <p className="text-sm text-gray-500 mb-6">Click <strong>Fetch Emails</strong> to connect to your inbox and generate AI summaries.</p>
            <button onClick={onFetch} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              Fetch Emails
            </button>
          </div>
        )}

        {/* Stat cards */}
        {summaries.length > 0 && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Total Emails" value={stats.total} sub={`${stats.newEmails} new`}
                color="bg-[#667eea]/10"
                icon={<svg className="w-5 h-5 text-[#667eea]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              />
              <StatCard label="Action Required" value={stats.actionRequired} sub="Needs your attention"
                color="bg-orange-50"
                icon={<svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
              />
              <StatCard label="Hiring Applications" value={stats.hiring} sub="Candidates received"
                color="bg-violet-50"
                icon={<svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              />
              <StatCard label="High Priority" value={stats.highPriority} sub="Critical + High"
                color="bg-red-50"
                icon={<svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              />
            </div>

            {/* Bottom grid: recent + categories */}
            <div className="grid xl:grid-cols-3 gap-6">
              {/* Recent emails mini-table */}
              <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                  <h2 className="font-semibold text-gray-900">Recent Emails</h2>
                  <button onClick={() => onNavigate("inbox")} className="text-xs text-[#667eea] hover:text-[#764ba2] font-medium">
                    View all →
                  </button>
                </div>
                <div className="divide-y divide-gray-50">
                  {recent.map((email) => (
                    <div key={email.emailId} className="flex items-start gap-4 px-6 py-3.5 hover:bg-gray-50/70 transition-colors">
                      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLOR[email.priority]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{email.subject || "(No Subject)"}</p>
                          <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(email.date)}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{email.from}</p>
                        <p className="text-xs text-gray-400 truncate mt-1">{email.summary}</p>
                      </div>
                      <span className={`mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLOR[email.category]}`}>
                        {email.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category breakdown */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="font-semibold text-gray-900 mb-4">By Category</h2>
                {sortedCategories.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {sortedCategories.map(([cat, count]) => {
                      const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[cat]}`}>{cat}</span>
                            <span className="text-xs text-gray-500 font-medium">{count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2] rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
