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
  Critical: "bg-red-500", High: "bg-orange-400", Medium: "bg-yellow-400", Low: "bg-green-400",
};

const CATEGORY_BADGE: Record<Category, string> = {
  Hiring: "text-violet-700 bg-violet-50",
  "Client Support": "text-blue-700 bg-blue-50",
  Sales: "text-emerald-700 bg-emerald-50",
  Finance: "text-green-700 bg-green-50",
  Internal: "text-gray-600 bg-gray-100",
  Marketing: "text-pink-700 bg-pink-50",
  Technical: "text-indigo-700 bg-indigo-50",
  General: "text-slate-600 bg-slate-100",
};

function formatRelative(iso: string) {
  try {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

interface StatCardProps {
  label: string;
  value: number;
  sub?: string;
  iconClass: string;
  icon: JSX.Element;
}

function StatCard({ label, value, sub, iconClass, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${iconClass}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardHome({ summaries, isLoading, lastFetched, onFetch, onNavigate }: DashboardHomeProps) {
  const total = summaries.length;
  const unread = summaries.filter(s => s.status === "New").length;
  const actionRequired = summaries.filter(s => s.actionRequired === "Yes").length;
  const hiring = summaries.filter(s => s.category === "Hiring").length;
  const highPriority = summaries.filter(s => s.priority === "Critical" || s.priority === "High").length;

  const byCategory = summaries.reduce<Partial<Record<Category, number>>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1; return acc;
  }, {});
  const sortedCategories = (Object.entries(byCategory) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  const recent = summaries.slice(0, 8);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 sm:px-8 py-5 flex-shrink-0">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{greeting}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              {lastFetched && <span className="ml-3 text-gray-400">· Synced {lastFetched}</span>}
            </p>
          </div>
          <button
            onClick={onFetch} disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {isLoading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            {isLoading ? "Syncing…" : total > 0 ? "Sync Inbox" : "Fetch Emails"}
          </button>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-6">

        {/* Empty state */}
        {!isLoading && total === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Your inbox is empty</h3>
            <p className="text-sm text-gray-500 mb-5">Click Fetch Emails to sync your inbox and generate AI summaries.</p>
            <button onClick={onFetch} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
              Fetch Emails
            </button>
          </div>
        )}

        {total > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Total Emails" value={total} sub={`${unread} unread`}
                iconClass="bg-indigo-50"
                icon={<svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              />
              <StatCard label="Unread" value={unread} sub="Not yet opened"
                iconClass="bg-blue-50"
                icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>}
              />
              <StatCard label="Action Required" value={actionRequired} sub="Awaiting reply"
                iconClass="bg-orange-50"
                icon={<svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
              />
              <StatCard label="High Priority" value={highPriority} sub="Critical + High"
                iconClass="bg-red-50"
                icon={<svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              />
            </div>

            {/* Content grid */}
            <div className="grid xl:grid-cols-3 gap-6">

              {/* Recent emails */}
              <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900 text-sm">Recent Emails</h2>
                  <button onClick={() => onNavigate("inbox")} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                    View all →
                  </button>
                </div>
                <div className="divide-y divide-gray-50">
                  {recent.map((email) => (
                    <div key={email.emailId} className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-default">
                      <span className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLOR[email.priority]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`text-sm truncate ${email.status === "New" ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                            {email.subject || "(No Subject)"}
                          </p>
                          <span className="text-xs text-gray-400 flex-shrink-0">{formatRelative(email.date)}</span>
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{email.from}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${CATEGORY_BADGE[email.category]}`}>
                        {email.category}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-gray-50">
                  <button onClick={() => onNavigate("inbox")} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                    Open inbox →
                  </button>
                </div>
              </div>

              {/* Category breakdown */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 text-sm mb-4">By Category</h2>
                {sortedCategories.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="space-y-3.5">
                    {sortedCategories.map(([cat, count]) => {
                      const pct = total ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_BADGE[cat]}`}>{cat}</span>
                            <span className="text-xs text-gray-500 font-medium">{count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {hiring > 0 && (
                  <button onClick={() => onNavigate("hiring")}
                    className="mt-5 w-full py-2 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors">
                    Review {hiring} hiring application{hiring > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
