"use client";

import type { EmailSummary, Category, Priority } from "@/lib/types";

interface AnalyticsViewProps {
  summaries: EmailSummary[];
}

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

const PRIORITY_COLOR: Record<Priority, { bar: string; label: string }> = {
  Critical: { bar: "bg-red-500", label: "text-red-600" },
  High: { bar: "bg-orange-400", label: "text-orange-500" },
  Medium: { bar: "bg-yellow-400", label: "text-yellow-600" },
  Low: { bar: "bg-green-400", label: "text-green-600" },
};

function pct(val: number, total: number) {
  if (total === 0) return 0;
  return Math.round((val / total) * 100);
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

export default function AnalyticsView({ summaries }: AnalyticsViewProps) {
  const total = summaries.length;
  const actionRequired = summaries.filter(s => s.actionRequired === "Yes").length;
  const hiring = summaries.filter(s => s.category === "Hiring").length;
  const highPriority = summaries.filter(s => s.priority === "Critical" || s.priority === "High").length;
  const newEmails = summaries.filter(s => s.status === "New").length;
  const openEmails = summaries.filter(s => s.status === "Open").length;
  const closedEmails = summaries.filter(s => s.status === "Closed").length;

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

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#f8fafc]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of {total} synced email{total !== 1 ? "s" : ""}</p>
      </div>

      {total === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <p className="text-sm">No data yet — sync your inbox first.</p>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Top stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Total Emails", value: total, sub: "All synced", color: "text-[#667eea]", bg: "bg-[#667eea]/10" },
              { label: "Action Required", value: actionRequired, sub: `${pct(actionRequired, total)}% of inbox`, color: "text-orange-500", bg: "bg-orange-50" },
              { label: "Hiring Applications", value: hiring, sub: `${pct(hiring, total)}% of inbox`, color: "text-violet-600", bg: "bg-violet-50" },
              { label: "High Priority", value: highPriority, sub: "Critical + High", color: "text-red-500", bg: "bg-red-50" },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.bg}`}>
                  <span className={`text-lg font-black ${c.color}`}>{c.value}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{c.value}</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{c.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            {/* Category breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-5">Emails by Category</h2>
              {sortedCategories.length === 0 ? (
                <p className="text-sm text-gray-400">No data</p>
              ) : (
                <div className="space-y-4">
                  {sortedCategories.map(([cat, count]) => {
                    const p = pct(count, total);
                    const cfg = CATEGORY_COLOR[cat];
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{count}</span>
                            <span className="text-xs text-gray-400 w-8 text-right">{p}%</span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${cfg.bar} rounded-full transition-all duration-700`} style={{ width: `${p}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Priority + Sentiment */}
            <div className="space-y-6">
              {/* Priority */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Priority Distribution</h2>
                <div className="space-y-3">
                  {(["Critical", "High", "Medium", "Low"] as Priority[]).map(priority => {
                    const count = byPriority[priority] ?? 0;
                    const p = pct(count, total);
                    const cfg = PRIORITY_COLOR[priority];
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
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center gap-3">
                  <h3 className="font-semibold text-gray-900 text-sm self-start">Status</h3>
                  <DonutRing ratio={total > 0 ? closedEmails / total : 0} color="#10b981" size={80} />
                  <div className="space-y-1 w-full text-xs">
                    <div className="flex justify-between"><span className="text-blue-600">New</span><span className="font-semibold">{newEmails}</span></div>
                    <div className="flex justify-between"><span className="text-amber-600">Open</span><span className="font-semibold">{openEmails}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Closed</span><span className="font-semibold">{closedEmails}</span></div>
                  </div>
                </div>

                {/* Sentiment */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
                  <h3 className="font-semibold text-gray-900 text-sm">Sentiment</h3>
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
          </div>

          {/* Action required ratio */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Action Required</h2>
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
        </div>
      )}
    </div>
  );
}
