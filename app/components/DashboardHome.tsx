"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailSummary, Priority, Category } from "@/lib/types";
import DataTable from "./DataTable";

interface DashboardHomeProps {
  summaries: EmailSummary[];
  isLoading: boolean;
  lastFetched: string | null;
  onFetch: () => void;
}

const PRIORITY_COLOR: Record<Priority, string> = {
  Critical: "bg-red-500", High: "bg-orange-400", Medium: "bg-yellow-400", Low: "bg-green-400",
};

const PRIORITY_BAR: Record<Priority, { bar: string; label: string }> = {
  Critical: { bar: "bg-red-500", label: "text-red-600" },
  High: { bar: "bg-orange-400", label: "text-orange-500" },
  Medium: { bar: "bg-yellow-400", label: "text-yellow-600" },
  Low: { bar: "bg-green-400", label: "text-green-600" },
};

const CATEGORY_COLOR: Record<Category, { bar: string; badge: string }> = {
  Hiring: { bar: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  "Client Support": { bar: "bg-blue-500", badge: "bg-blue-50 text-blue-700" },
  Sales: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  Finance: { bar: "bg-green-500", badge: "bg-green-50 text-green-700" },
  Internal: { bar: "bg-gray-400", badge: "bg-gray-100 text-gray-600" },
  Marketing: { bar: "bg-pink-500", badge: "bg-pink-50 text-pink-700" },
  Technical: { bar: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700" },
  General: { bar: "bg-slate-400", badge: "bg-slate-100 text-slate-600" },
};

function pct(val: number, total: number) {
  return total === 0 ? 0 : Math.round((val / total) * 100);
}

function isToday(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  } catch { return false; }
}

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

function DonutRing({ ratio, color, size = 80 }: { ratio: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * ratio;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-700" />
    </svg>
  );
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
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconClass}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardHome({ summaries, isLoading, lastFetched, onFetch }: DashboardHomeProps) {
  const router = useRouter();
  const total = summaries.length;
  const unread = summaries.filter(s => s.status === "New").length;
  const openEmails = summaries.filter(s => s.status === "Open").length;
  const closedEmails = summaries.filter(s => s.status === "Closed").length;
  const actionRequired = summaries.filter(s => s.actionRequired === "Yes").length;
  const hiring = summaries.filter(s => s.category === "Hiring").length;
  const highPriority = summaries.filter(s => s.priority === "Critical" || s.priority === "High").length;

  // Daily digest — today's slice
  const todayEmails = summaries.filter(s => isToday(s.date));
  const todayHiring = todayEmails.filter(s => s.category === "Hiring").length;
  const todayAction = todayEmails.filter(s => s.actionRequired === "Yes").length;
  const todayHighPriority = todayEmails.filter(s => s.priority === "Critical" || s.priority === "High").length;
  const todayImportant = todayEmails.filter(s =>
    s.priority === "Critical" || s.priority === "High" || s.actionRequired === "Yes"
  );
  const hasDigest = todayEmails.length > 0;

  const byCategory = summaries.reduce<Partial<Record<Category, number>>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1; return acc;
  }, {});
  const sortedCategories = (Object.entries(byCategory) as [Category, number][]).sort((a, b) => b[1] - a[1]);

  const byPriority = summaries.reduce<Partial<Record<Priority, number>>>((acc, s) => {
    acc[s.priority] = (acc[s.priority] ?? 0) + 1; return acc;
  }, {});

  const bySentiment = {
    positive: summaries.filter(s => s.sentiment === "positive").length,
    neutral: summaries.filter(s => s.sentiment === "neutral").length,
    negative: summaries.filter(s => s.sentiment === "negative").length,
  };

  const recent = summaries.slice(0, 8);

  // Gmail-style single-line row, matching Inbox/Hiring's list styling.
  function renderRecentRow(email: EmailSummary) {
    return (
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLOR[email.priority]}`} title={`${email.priority} priority`} />
        <span className="flex-1 min-w-0 truncate text-xs">
          <span className={email.status === "New" ? "font-semibold text-gray-900" : "text-gray-700"}>{email.subject || "(No Subject)"}</span>
          <span className="text-gray-400"> — {email.from}</span>
        </span>
        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${CATEGORY_COLOR[email.category]?.badge ?? "bg-gray-100 text-gray-600"}`}>
          {email.category}
        </span>
        <span className="w-14 flex-shrink-0 text-right text-xs text-gray-400 whitespace-nowrap">{formatRelative(email.date)}</span>
      </div>
    );
  }

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
              Here&rsquo;s what&rsquo;s happening in your inbox today ·{" "}
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              {lastFetched && <span className="ml-3 text-gray-400">· Last updated {lastFetched}</span>}
            </p>
          </div>
          <button
            onClick={onFetch} disabled={isLoading}
            title="Check your mailbox for new emails and update this dashboard"
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

      <div className="p-6 sm:p-8 space-y-5">

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
            {/* ── Daily Digest ────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Daily Digest</p>
                  <p className="text-xs text-gray-400">
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>

              {!hasDigest ? (
                <div className="px-5 py-4 text-sm text-gray-400">No emails received today yet.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {/* Summary row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100">
                    {[
                      { label: "Received Today", value: todayEmails.length, color: "text-indigo-600", bg: "bg-indigo-50" },
                      { label: "Candidates", value: todayHiring, color: "text-violet-600", bg: "bg-violet-50" },
                      { label: "High Priority", value: todayHighPriority, color: "text-red-500", bg: "bg-red-50" },
                      { label: "Need Action", value: todayAction, color: "text-orange-500", bg: "bg-orange-50" },
                    ].map(item => (
                      <div key={item.label} className="px-5 py-4">
                        <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Important emails list */}
                  {todayImportant.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-5 pt-3 pb-2">
                        Needs Attention Today
                      </p>
                      <div className="divide-y divide-gray-50">
                        {todayImportant.slice(0, 5).map(email => (
                          <div key={email.emailId} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLOR[email.priority]}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{email.subject || "(No Subject)"}</p>
                              <p className="text-xs text-gray-400 truncate">{email.from}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {email.actionRequired === "Yes" && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 ring-1 ring-orange-200">Action</span>
                              )}
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                                ${email.priority === "Critical" ? "bg-red-50 text-red-600 ring-1 ring-red-200"
                                  : "bg-orange-50 text-orange-600 ring-1 ring-orange-200"}`}>
                                {email.priority}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {todayImportant.length > 5 && (
                        <div className="px-5 pb-3 pt-1">
                          <Link href="/inbox" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                            +{todayImportant.length - 5} more → View inbox
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Stat cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Total Emails" value={total} sub={`${unread} unread`}
                iconClass="bg-indigo-50"
                icon={<svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              />
              <StatCard label="Action Required" value={actionRequired} sub={`${pct(actionRequired, total)}% of inbox`}
                iconClass="bg-orange-50"
                icon={<svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
              />
              <StatCard label="Hiring Applications" value={hiring} sub={`${pct(hiring, total)}% of inbox`}
                iconClass="bg-violet-50"
                icon={<svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
              />
              <StatCard label="High Priority" value={highPriority} sub="Needs your attention soon"
                iconClass="bg-red-50"
                icon={<svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              />
            </div>

            {/* ── Recent emails + Category ─────────────────────────────── */}
            <div className="grid xl:grid-cols-3 gap-6">

              {/* Recent emails */}
              <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900 text-sm">Recent Emails</h2>
                  <Link href="/inbox" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                    View all →
                  </Link>
                </div>
                <DataTable
                  variant="list"
                  renderRow={renderRecentRow}
                  rows={recent}
                  rowKey={(email) => email.emailId}
                  onRowClick={(email) => router.push(`/inbox/${encodeURIComponent(email.emailId)}`)}
                  fillHeight={false}
                  emptyState={<p className="text-sm text-gray-400 py-8">No emails yet</p>}
                />
                <div className="px-5 py-3 border-t border-gray-50">
                  <Link href="/inbox" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                    Open inbox →
                  </Link>
                </div>
              </div>

              {/* Category breakdown */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 text-sm">By Category</h2>
                <p className="text-xs text-gray-400 mb-4">What kind of emails you&rsquo;re receiving</p>
                {sortedCategories.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="space-y-3.5">
                    {sortedCategories.map(([cat, count]) => {
                      const p = pct(count, total);
                      const cfg = CATEGORY_COLOR[cat];
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cat}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900">{count}</span>
                              <span className="text-xs text-gray-400 w-8 text-right">{p}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${cfg.bar} rounded-full transition-all duration-500`} style={{ width: `${p}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {hiring > 0 && (
                  <Link href="/hiring"
                    className="mt-5 block w-full text-center py-2 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors">
                    Review {hiring} hiring application{hiring > 1 ? "s" : ""} →
                  </Link>
                )}
              </div>
            </div>

            {/* ── Priority + Status + Sentiment ───────────────────────── */}
            <div className="grid xl:grid-cols-2 gap-6">

              {/* Priority distribution */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-900 text-sm">Priority Distribution</h2>
                <p className="text-xs text-gray-400 mb-4">How urgent your emails are, from most to least</p>
                <div className="space-y-3">
                  {(["Critical", "High", "Medium", "Low"] as Priority[]).map(priority => {
                    const count = byPriority[priority] ?? 0;
                    const p = pct(count, total);
                    const cfg = PRIORITY_BAR[priority];
                    return (
                      <div key={priority} className="flex items-center gap-3">
                        <span className={`text-xs font-semibold w-16 ${cfg.label}`}>{priority}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${cfg.bar} rounded-full transition-all duration-700`} style={{ width: `${p}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600 w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status + Sentiment */}
              <div className="grid grid-cols-2 gap-4">
                {/* Status donut */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col items-center gap-3">
                  <div className="self-start">
                    <h3 className="font-semibold text-gray-900 text-sm">Status</h3>
                    <p className="text-[11px] text-gray-400">Green ring = share resolved</p>
                  </div>
                  <DonutRing ratio={total > 0 ? closedEmails / total : 0} color="#10b981" size={80} />
                  <div className="space-y-1 w-full text-xs">
                    <div className="flex justify-between"><span className="text-blue-600">New (unread)</span><span className="font-semibold">{unread}</span></div>
                    <div className="flex justify-between"><span className="text-amber-600">Open (in progress)</span><span className="font-semibold">{openEmails}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Closed (resolved)</span><span className="font-semibold">{closedEmails}</span></div>
                  </div>
                </div>

                {/* Sentiment */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Sentiment</h3>
                    <p className="text-[11px] text-gray-400">The overall tone of your emails</p>
                  </div>
                  <div className="flex-1 space-y-2.5 text-xs">
                    {[
                      { label: "Positive", val: bySentiment.positive, color: "bg-emerald-400", text: "text-emerald-600" },
                      { label: "Neutral", val: bySentiment.neutral, color: "bg-gray-300", text: "text-gray-500" },
                      { label: "Negative", val: bySentiment.negative, color: "bg-red-400", text: "text-red-500" },
                    ].map(s => (
                      <div key={s.label}>
                        <div className="flex justify-between mb-1">
                          <span className={s.text}>{s.label}</span>
                          <span className="font-semibold text-gray-700">{s.val}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full">
                          <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${pct(s.val, total)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Action required bar ──────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 text-sm">Action Required</h2>
                <span className="text-sm font-semibold text-gray-500">{actionRequired} / {total}</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-red-400 rounded-full transition-all duration-700"
                  style={{ width: `${pct(actionRequired, total)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{actionRequired} require action <span className="text-orange-500 font-semibold">({pct(actionRequired, total)}%)</span></span>
                <span>{total - actionRequired} informational</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
