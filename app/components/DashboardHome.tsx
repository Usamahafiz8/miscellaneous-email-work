"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { EmailSummary, Priority, Category } from "@/lib/types";
import { parseSender } from "@/lib/utils";
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

function DonutRing({ ratio, color, size = 72 }: { ratio: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * ratio;
  return (
    <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-700" />
    </svg>
  );
}

// Shared card chrome. Every panel below is the same shape, so the dashboard
// reads as one grid rather than a stack of differently-padded boxes.
function Card({ title, subtitle, action, className = "", bodyClass = "", children }: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClass?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-gray-900 leading-tight">{title}</h2>
            {subtitle && <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={`flex-1 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  );
}

interface StatTileProps {
  label: string;
  value: number;
  sub?: string;
  tone: string;
  href?: string;
  icon: JSX.Element;
}

// Compact KPI tile — the old cards were ~110px tall with a 36px icon badge on
// its own line. Putting the icon beside the number halves the height, which is
// what lets six of them sit in the space four used to need.
function StatTile({ label, value, sub, tone, href, icon }: StatTileProps) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tone}`}>{icon}</span>
        <span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{value.toLocaleString()}</span>
      </div>
      <p className="text-[11px] font-medium text-gray-600 mt-1.5 truncate">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
    </>
  );

  const cls = "bg-white rounded-xl border border-gray-200 px-3 py-2.5 transition-shadow";
  return href
    ? <Link href={href} className={`${cls} hover:shadow-md hover:border-indigo-200 block`}>{inner}</Link>
    : <div className={`${cls} hover:shadow-sm`}>{inner}</div>;
}

export default function DashboardHome({ summaries, isLoading, lastFetched, onFetch }: DashboardHomeProps) {
  const router = useRouter();

  // Every stat/chart below is a pass over `summaries` (up to a few hundred rows).
  // Cheap individually, but DashboardHome re-renders several times per sync
  // (isLoading/isSyncing toggling) while `summaries` itself stays the same
  // reference — memoizing keeps that from re-scanning the list on every one
  // of those renders, only recomputing when the data actually changes.
  const stats = useMemo(() => {
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

    // Who's filling the inbox — the wide grid has room for it, and "who emails
    // me most" is a question the old layout couldn't answer at all.
    const senderCounts = new Map<string, number>();
    for (const s of summaries) {
      const name = parseSender(s.from).name || s.from;
      senderCounts.set(name, (senderCounts.get(name) ?? 0) + 1);
    }
    const topSenders = Array.from(senderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);

    const recent = summaries.slice(0, 14);

    return {
      total, unread, openEmails, closedEmails, actionRequired, hiring, highPriority,
      todayEmails, todayHiring, todayAction, todayHighPriority, todayImportant, hasDigest,
      sortedCategories, byPriority, bySentiment, topSenders, recent,
    };
  }, [summaries]);

  const {
    total, unread, openEmails, closedEmails, actionRequired, hiring, highPriority,
    todayEmails, todayHiring, todayAction, todayHighPriority, todayImportant, hasDigest,
    sortedCategories, byPriority, bySentiment, topSenders, recent,
  } = stats;

  // Gmail-style single-line row, matching Inbox/Hiring's list styling.
  function renderRecentRow(email: EmailSummary) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLOR[email.priority]}`} title={`${email.priority} priority`} />
        <span className="flex-1 min-w-0 truncate text-xs">
          <span className={email.status === "New" ? "font-semibold text-gray-900" : "text-gray-700"}>{email.subject || "(No Subject)"}</span>
          <span className="text-gray-400"> — {parseSender(email.from).name}</span>
        </span>
        {email.actionRequired === "Yes" && (
          <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 rounded-full bg-orange-50 text-orange-600">Action</span>
        )}
        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${CATEGORY_COLOR[email.category]?.badge ?? "bg-gray-100 text-gray-600"}`}>
          {email.category}
        </span>
        <span className="w-14 flex-shrink-0 text-right text-[11px] text-gray-400 whitespace-nowrap">{formatRelative(email.date)}</span>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const maxSender = topSenders[0]?.[1] ?? 1;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Header — one compact row instead of the old two-line block. */}
      <div className="bg-white border-b border-gray-200 bar-pad flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-sm font-bold text-gray-900">{greeting}</h1>
          <p className="text-[11px] text-gray-400 truncate">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {lastFetched && <span className="ml-2">· Updated {lastFetched}</span>}
            <span className="ml-2 hidden lg:inline">· Based on your {total.toLocaleString()} most recent emails</span>
          </p>
        </div>
        <button
          onClick={onFetch} disabled={isLoading}
          title="Check your mailbox for new emails and update this dashboard"
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[13px] font-medium transition active:scale-[0.98]"
        >
          {isLoading
            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          }
          {isLoading ? "Syncing…" : total > 0 ? "Sync Inbox" : "Fetch Emails"}
        </button>
      </div>

      {/* Body — a 12-column grid that keeps filling the row as the viewport
          widens, instead of capping out at three columns and leaving the right
          third of a large monitor empty. */}
      <div className="flex-1 overflow-y-auto p-[var(--gutter)] space-y-[var(--card-gap)]">

        {/* Empty / first-load states */}
        {isLoading && total === 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-[var(--card-gap)]">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[74px] rounded-xl" />)}
          </div>
        )}

        {!isLoading && total === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Your inbox is empty</h3>
            <p className="text-sm text-gray-500 mb-5">Click Fetch Emails to sync your inbox and generate AI summaries.</p>
            <button onClick={onFetch} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition active:scale-[0.98]">
              Fetch Emails
            </button>
          </div>
        )}

        {total > 0 && (
          <>
            {/* ── KPI strip: six tiles across on wide screens ─────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-[var(--card-gap)]">
              <StatTile label="Total Emails" value={total} sub={`${unread} unread`} href="/inbox"
                tone="bg-indigo-50"
                icon={<svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              />
              <StatTile label="Arrived Today" value={todayEmails.length} sub={`${todayHighPriority} high priority`}
                tone="bg-sky-50"
                icon={<svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatTile label="Action Required" value={actionRequired} sub={`${pct(actionRequired, total)}% of inbox`}
                tone="bg-orange-50"
                icon={<svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
              />
              <StatTile label="High Priority" value={highPriority} sub="Needs attention soon"
                tone="bg-red-50"
                icon={<svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              />
              <StatTile label="Hiring Applications" value={hiring} sub={`${todayHiring} today`} href="/hiring"
                tone="bg-violet-50"
                icon={<svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
              />
              <StatTile label="Resolved" value={closedEmails} sub={`${pct(closedEmails, total)}% closed out`}
                tone="bg-emerald-50"
                icon={<svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
            </div>

            {/* ── Digest + recent activity ────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-[var(--card-gap)] items-start">

              {/* Today's digest */}
              <Card
                className="xl:col-span-4"
                title="Today"
                subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              >
                {!hasDigest ? (
                  <p className="px-3.5 pb-4 text-[13px] text-gray-400">No emails received today yet.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 divide-x divide-gray-100 border-y border-gray-100">
                      {[
                        { label: "Received", value: todayEmails.length, color: "text-indigo-600" },
                        { label: "Candidates", value: todayHiring, color: "text-violet-600" },
                        { label: "Urgent", value: todayHighPriority, color: "text-red-500" },
                        { label: "Need action", value: todayAction, color: "text-orange-500" },
                      ].map(item => (
                        <div key={item.label} className="px-2 py-2.5 text-center">
                          <p className={`text-lg font-bold tabular-nums ${item.color}`}>{item.value}</p>
                          <p className="text-[10px] text-gray-500 leading-tight">{item.label}</p>
                        </div>
                      ))}
                    </div>

                    {todayImportant.length > 0 ? (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-3.5 pt-2.5 pb-1">
                          Needs attention today
                        </p>
                        <div className="divide-y divide-gray-50">
                          {todayImportant.slice(0, 6).map(email => (
                            <button
                              key={email.emailId}
                              onClick={() => router.push(`/inbox/${encodeURIComponent(email.emailId)}`)}
                              className="w-full text-left flex items-center gap-2 px-3.5 py-1.5 hover:bg-gray-50 transition-colors"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLOR[email.priority]}`} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-medium text-gray-800 truncate">{email.subject || "(No Subject)"}</span>
                                <span className="block text-[10px] text-gray-400 truncate">{parseSender(email.from).name}</span>
                              </span>
                              {email.actionRequired === "Yes" && (
                                <span className="flex-shrink-0 text-[9px] font-semibold px-1.5 rounded-full bg-orange-50 text-orange-600 ring-1 ring-orange-200">Action</span>
                              )}
                            </button>
                          ))}
                        </div>
                        {todayImportant.length > 6 && (
                          <div className="px-3.5 py-2">
                            <Link href="/inbox" className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium">
                              +{todayImportant.length - 6} more → View inbox
                            </Link>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="px-3.5 py-4 text-[13px] text-gray-400">Nothing urgent today — you&rsquo;re all clear.</p>
                    )}
                  </>
                )}
              </Card>

              {/* Recent emails */}
              <Card
                className="xl:col-span-8"
                title="Recent Emails"
                subtitle="Newest first — click any row to open it"
                action={
                  <Link href="/inbox" className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap">
                    View all →
                  </Link>
                }
              >
                <DataTable
                  variant="list"
                  renderRow={renderRecentRow}
                  rows={recent}
                  rowKey={(email) => email.emailId}
                  onRowClick={(email) => router.push(`/inbox/${encodeURIComponent(email.emailId)}`)}
                  fillHeight={false}
                  emptyState={<p className="text-sm text-gray-400 py-8">No emails yet</p>}
                />
              </Card>
            </div>

            {/* ── Breakdown row: four across on wide screens ──────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-[var(--card-gap)] items-start">

              {/* Category */}
              <Card title="By Category" subtitle="What kind of email you’re getting" bodyClass="px-3.5 pb-3.5">
                {sortedCategories.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {sortedCategories.map(([cat, count]) => {
                      const p = pct(count, total);
                      const cfg = CATEGORY_COLOR[cat];
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>{cat}</span>
                            <span className="text-[11px] text-gray-500 tabular-nums">
                              <strong className="text-gray-800 font-semibold">{count}</strong> · {p}%
                            </span>
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
                    className="mt-3 block w-full text-center py-1.5 text-[11px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">
                    Review {hiring} hiring application{hiring > 1 ? "s" : ""} →
                  </Link>
                )}
              </Card>

              {/* Priority + action-required footer */}
              <Card title="Priority Distribution" subtitle="How urgent your mail is" bodyClass="px-3.5 pb-3.5">
                <div className="space-y-2">
                  {(["Critical", "High", "Medium", "Low"] as Priority[]).map(priority => {
                    const count = byPriority[priority] ?? 0;
                    const p = pct(count, total);
                    const cfg = PRIORITY_BAR[priority];
                    return (
                      <div key={priority} className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold w-14 flex-shrink-0 ${cfg.label}`}>{priority}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${cfg.bar} rounded-full transition-all duration-700`} style={{ width: `${p}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-gray-600 w-7 text-right tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-gray-600">Action required</span>
                    <span className="text-[11px] text-gray-500 tabular-nums">{actionRequired} / {total}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-400 to-red-400 rounded-full transition-all duration-700"
                      style={{ width: `${pct(actionRequired, total)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    <span className="text-orange-500 font-semibold">{pct(actionRequired, total)}%</span> need a reply · {total - actionRequired} informational
                  </p>
                </div>
              </Card>

              {/* Busiest senders */}
              <Card title="Busiest Senders" subtitle="Who fills your inbox most" bodyClass="px-3.5 pb-3.5">
                {topSenders.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {topSenders.map(([name, count]) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate text-[11px] text-gray-600" title={name}>{name}</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-indigo-400 rounded-full transition-all duration-500" style={{ width: `${(count / maxSender) * 100}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-gray-700 w-6 text-right tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Status + sentiment */}
              <Card title="Status & Tone" subtitle="Where things stand overall" bodyClass="px-3.5 pb-3.5">
                <div className="flex items-center gap-3">
                  <DonutRing ratio={total > 0 ? closedEmails / total : 0} color="#10b981" size={72} />
                  <div className="flex-1 space-y-1 text-[11px] min-w-0">
                    <div className="flex justify-between gap-2"><span className="text-blue-600 truncate">New</span><span className="font-semibold tabular-nums">{unread}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-amber-600 truncate">In progress</span><span className="font-semibold tabular-nums">{openEmails}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-gray-500 truncate">Resolved</span><span className="font-semibold tabular-nums">{closedEmails}</span></div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  {[
                    { label: "Positive", val: bySentiment.positive, color: "bg-emerald-400", text: "text-emerald-600" },
                    { label: "Neutral", val: bySentiment.neutral, color: "bg-gray-300", text: "text-gray-500" },
                    { label: "Negative", val: bySentiment.negative, color: "bg-red-400", text: "text-red-500" },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      <span className={`text-[11px] w-14 flex-shrink-0 ${s.text}`}>{s.label}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${pct(s.val, total)}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-gray-600 w-6 text-right tabular-nums">{s.val}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
