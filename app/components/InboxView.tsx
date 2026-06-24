"use client";

import { useState, useMemo } from "react";
import type { EmailSummary, EmailStatus, Category, Priority, ActionRequired, CATEGORIES, PRIORITIES } from "@/lib/types";
import { STATUSES } from "@/lib/types";

interface InboxViewProps {
  summaries: EmailSummary[];
  isLoading: boolean;
  onFetch: () => void;
  onStatusChange: (emailId: string, status: EmailStatus) => void;
}

const PRIORITY_DOT: Record<Priority, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-400",
  Medium: "bg-yellow-400",
  Low: "bg-green-400",
};

const PRIORITY_TEXT: Record<Priority, string> = {
  Critical: "text-red-600",
  High: "text-orange-500",
  Medium: "text-yellow-600",
  Low: "text-green-600",
};

const CATEGORY_STYLE: Record<string, string> = {
  Hiring: "bg-violet-50 text-violet-700 ring-violet-200",
  "Client Support": "bg-blue-50 text-blue-700 ring-blue-200",
  Sales: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Finance: "bg-green-50 text-green-700 ring-green-200",
  Internal: "bg-gray-100 text-gray-600 ring-gray-200",
  Marketing: "bg-pink-50 text-pink-700 ring-pink-200",
  Technical: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  General: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STATUS_STYLE: Record<EmailStatus, string> = {
  New: "bg-blue-50 text-blue-700 ring-blue-200",
  Open: "bg-amber-50 text-amber-700 ring-amber-200",
  Closed: "bg-gray-100 text-gray-500 ring-gray-200",
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function getSenderName(from: string) {
  const name = from.replace(/<.*>/, "").trim();
  return name || from.split("@")[0];
}

function getSenderEmail(from: string) {
  return from.match(/<(.+)>/)?.[1] ?? from;
}

export default function InboxView({ summaries, isLoading, onFetch, onStatusChange }: InboxViewProps) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      if (filterCategory && s.category !== filterCategory) return false;
      if (filterPriority && s.priority !== filterPriority) return false;
      if (filterAction && s.actionRequired !== filterAction) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return s.subject.toLowerCase().includes(q) || s.from.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q);
      }
      return true;
    });
  }, [summaries, search, filterCategory, filterPriority, filterAction, filterStatus]);

  const hasFilters = search || filterCategory || filterPriority || filterAction || filterStatus;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8fafc]">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} of {summaries.length} emails
            </p>
          </div>
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
            {isLoading ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex-shrink-0 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emails…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea] focus:bg-white transition-colors"
          />
        </div>

        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
          <option value="">All Categories</option>
          {["Hiring", "Client Support", "Sales", "Finance", "Internal", "Marketing", "Technical", "General"].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
          <option value="">All Priorities</option>
          {["Critical", "High", "Medium", "Low"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
          <option value="">Action Required</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(""); setFilterCategory(""); setFilterPriority(""); setFilterAction(""); setFilterStatus(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border border-gray-200 bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-[#667eea] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Syncing inbox…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm">{summaries.length === 0 ? "No emails synced yet" : "No emails match your filters"}</p>
          </div>
        ) : (
          <table className="w-full min-w-[1000px] text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                {["Date", "From", "Subject & Summary", "Category", "Priority", "Action", "Status"].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {filtered.map((email) => {
                const expanded = expandedRow === email.emailId;
                return (
                  <>
                    <tr
                      key={email.emailId}
                      onClick={() => setExpandedRow(expanded ? null : email.emailId)}
                      className={`cursor-pointer transition-colors group ${expanded ? "bg-indigo-50/40" : "hover:bg-gray-50/80"}`}
                    >
                      {/* Date */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap text-xs text-gray-500">
                        {formatDate(email.date)}
                      </td>

                      {/* From */}
                      <td className="px-4 py-3.5 align-top max-w-[160px]">
                        <p className="font-medium text-gray-900 truncate text-xs">{getSenderName(email.from)}</p>
                        <p className="text-gray-400 truncate text-[11px]">{getSenderEmail(email.from)}</p>
                      </td>

                      {/* Subject + summary */}
                      <td className="px-4 py-3.5 align-top max-w-xs">
                        <p className={`font-semibold truncate ${email.status === "New" ? "text-gray-900" : "text-gray-600"}`}>
                          {email.subject || "(No Subject)"}
                        </p>
                        <p className="text-gray-400 text-[11px] truncate mt-0.5">{email.summary}</p>
                        <p className="text-[10px] text-[#667eea] mt-1 font-medium">{email.purpose}</p>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_STYLE[email.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                          {email.category}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[email.priority]}`} />
                          <span className={`text-xs font-medium ${PRIORITY_TEXT[email.priority]}`}>{email.priority}</span>
                        </div>
                      </td>

                      {/* Action required */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ring-inset ${email.actionRequired === "Yes" ? "bg-red-50 text-red-600 ring-red-200" : "bg-gray-100 text-gray-500 ring-gray-200"}`}>
                          {email.actionRequired}
                        </span>
                      </td>

                      {/* Status dropdown */}
                      <td className="px-4 py-3.5 align-top" onClick={e => e.stopPropagation()}>
                        <select
                          value={email.status}
                          onChange={e => onStatusChange(email.emailId, e.target.value as EmailStatus)}
                          className={`text-[10px] font-semibold px-2 py-1 rounded-lg ring-1 ring-inset border-0 focus:outline-none cursor-pointer ${STATUS_STYLE[email.status]}`}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {expanded && (
                      <tr key={`${email.emailId}-expanded`} className="bg-indigo-50/30">
                        <td colSpan={7} className="px-6 py-5">
                          <div className="grid grid-cols-3 gap-6">
                            <div className="col-span-2 space-y-4">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">AI Summary</p>
                                <p className="text-sm text-gray-700 leading-relaxed">{email.summary}</p>
                              </div>
                              {email.keyPoints.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Key Points</p>
                                  <ul className="space-y-1.5">
                                    {email.keyPoints.map((pt, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#667eea] flex-shrink-0" />
                                        {pt}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <div className="space-y-3 text-sm">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Purpose</p>
                                <p className="text-gray-700 font-medium">{email.purpose}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Sentiment</p>
                                <p className={`font-medium capitalize ${email.sentiment === "positive" ? "text-emerald-600" : email.sentiment === "negative" ? "text-red-500" : "text-gray-500"}`}>
                                  {email.sentiment}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Received</p>
                                <p className="text-gray-600 text-xs">{new Date(email.date).toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
