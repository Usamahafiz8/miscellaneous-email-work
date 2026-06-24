"use client";

import { useState, useMemo } from "react";
import type { EmailSummary, EmailStatus, Priority } from "@/lib/types";
import { STATUSES } from "@/lib/types";

interface InboxViewProps {
  summaries: EmailSummary[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  onFetch: () => void;
  onLoadMore: () => void;
  onStatusChange: (emailId: string, status: EmailStatus) => void;
}

const PRIORITY_DOT: Record<Priority, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-400",
  Medium: "bg-yellow-400",
  Low: "bg-green-400",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  Critical: "bg-red-50 text-red-600 ring-red-200",
  High: "bg-orange-50 text-orange-600 ring-orange-200",
  Medium: "bg-yellow-50 text-yellow-700 ring-yellow-200",
  Low: "bg-green-50 text-green-700 ring-green-200",
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

const SENTIMENT_STYLE: Record<string, string> = {
  positive: "text-emerald-600 bg-emerald-50",
  neutral: "text-gray-500 bg-gray-100",
  negative: "text-red-500 bg-red-50",
};

const STATUS_STYLE: Record<EmailStatus, string> = {
  New: "bg-blue-50 text-blue-700 ring-blue-200",
  Open: "bg-amber-50 text-amber-700 ring-amber-200",
  Closed: "bg-gray-100 text-gray-500 ring-gray-200",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDateFull(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function getSenderName(from: string) {
  const name = from.replace(/<.*>/, "").replace(/"/g, "").trim();
  return name || from.split("@")[0];
}

function getSenderEmail(from: string) {
  return from.match(/<(.+)>/)?.[1] ?? from;
}

function getSenderInitial(from: string) {
  return getSenderName(from).charAt(0).toUpperCase();
}

export default function InboxView({ summaries, isLoading, isLoadingMore, hasMore, totalCount, onFetch, onLoadMore, onStatusChange }: InboxViewProps) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selected, setSelected] = useState<EmailSummary | null>(null);

  const filtered = useMemo(() => summaries.filter((s) => {
    if (filterCategory && s.category !== filterCategory) return false;
    if (filterPriority && s.priority !== filterPriority) return false;
    if (filterAction && s.actionRequired !== filterAction) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.subject.toLowerCase().includes(q) || s.from.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q);
    }
    return true;
  }), [summaries, search, filterCategory, filterPriority, filterAction, filterStatus]);

  const hasFilters = search || filterCategory || filterPriority || filterAction || filterStatus;
  const selectedEmail = selected ? (summaries.find(s => s.emailId === selected.emailId) ?? selected) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8fafc]">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Inbox</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {filtered.length} of {summaries.length} loaded
              {totalCount > 0 && ` · ${totalCount} total`}
            </p>
          </div>
          <button onClick={onFetch} disabled={isLoading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm flex-shrink-0">
            {isLoading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            <span className="hidden sm:inline">{isLoading ? "Syncing…" : "Sync"}</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-2.5 flex-shrink-0 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-40">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea] focus:bg-white transition-colors" />
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="flex-1 sm:flex-none text-xs sm:text-sm rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
            <option value="">Category</option>
            {["Hiring","Client Support","Sales","Finance","Internal","Marketing","Technical","General"].map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="flex-1 sm:flex-none text-xs sm:text-sm rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
            <option value="">Priority</option>
            {["Critical","High","Medium","Low"].map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="flex-1 sm:flex-none text-xs sm:text-sm rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
            <option value="">Action</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="flex-1 sm:flex-none text-xs sm:text-sm rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]">
            <option value="">Status</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterPriority(""); setFilterAction(""); setFilterStatus(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border border-gray-200 bg-gray-50">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Body: list + detail panel */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Email list — always visible, shrinks on desktop when panel is open */}
        <div className={`flex flex-col overflow-hidden transition-all duration-200 bg-[#f8fafc]
          ${selectedEmail ? "hidden md:flex md:w-[380px] lg:w-[420px] md:flex-shrink-0 md:border-r md:border-gray-100" : "flex-1"}`}>
          <div className="flex-1 overflow-y-auto">
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
              <ul className="divide-y divide-gray-100">
                {filtered.map((email) => {
                  const isSelected = selectedEmail?.emailId === email.emailId;
                  return (
                    <li key={email.emailId} onClick={() => setSelected(isSelected ? null : email)}
                      className={`px-4 py-3.5 cursor-pointer transition-colors border-l-2
                        ${isSelected ? "bg-indigo-50 border-[#667eea]" : "bg-white hover:bg-gray-50 border-transparent"}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                          {getSenderInitial(email.from)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className={`text-xs font-semibold truncate ${email.status === "New" ? "text-gray-900" : "text-gray-500"}`}>
                              {getSenderName(email.from)}
                            </span>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDate(email.date)}</span>
                          </div>
                          <p className={`text-xs truncate mb-1 ${email.status === "New" ? "font-medium text-gray-800" : "text-gray-500"}`}>
                            {email.subject || "(No Subject)"}
                          </p>
                          <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">{email.summary}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_STYLE[email.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                              {email.category}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-gray-500">
                              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[email.priority]}`} />
                              {email.priority}
                            </span>
                            {email.actionRequired === "Yes" && (
                              <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-inset ring-red-200">
                                Action needed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {(hasMore || isLoadingMore) && (
              <div className="flex justify-center py-5 border-t border-gray-100 bg-white">
                <button onClick={onLoadMore} disabled={isLoadingMore}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm">
                  {isLoadingMore
                    ? <><div className="w-3.5 h-3.5 border-2 border-[#667eea] border-t-transparent rounded-full animate-spin" />Loading…</>
                    : <>Load more <span className="text-xs text-gray-400">({summaries.length} of {totalCount})</span></>
                  }
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedEmail ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-white absolute inset-0 md:static md:inset-auto">
            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-gray-100 flex-shrink-0 bg-white">
              <button onClick={() => setSelected(null)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="md:hidden">Back</span>
              </button>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">AI Summary</span>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 sm:px-6 py-5 space-y-5 max-w-2xl mx-auto">

                {/* Subject */}
                <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
                  {selectedEmail.subject || "(No Subject)"}
                </h2>

                {/* Sender row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {getSenderInitial(selectedEmail.from)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{getSenderName(selectedEmail.from)}</p>
                    <p className="text-xs text-gray-400 truncate">{getSenderEmail(selectedEmail.from)}</p>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">{formatDateFull(selectedEmail.date)}</p>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ${CATEGORY_STYLE[selectedEmail.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                    {selectedEmail.category}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ${PRIORITY_BADGE[selectedEmail.priority]}`}>
                    {selectedEmail.priority} Priority
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${SENTIMENT_STYLE[selectedEmail.sentiment]}`}>
                    {selectedEmail.sentiment}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ${selectedEmail.actionRequired === "Yes" ? "bg-red-50 text-red-600 ring-red-200" : "bg-gray-100 text-gray-500 ring-gray-200"}`}>
                    {selectedEmail.actionRequired === "Yes" ? "Action Required" : "No Action"}
                  </span>
                </div>

                {/* AI Summary card */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 sm:p-5 border border-indigo-100">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-[#667eea] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span className="text-xs font-bold text-[#667eea] uppercase tracking-widest">AI Summary</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedEmail.summary}</p>
                </div>

                {/* Key points */}
                {selectedEmail.keyPoints.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Key Points</p>
                    <ul className="space-y-2.5">
                      {selectedEmail.keyPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="mt-1 w-5 h-5 rounded-full bg-indigo-100 text-[#667eea] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-sm text-gray-700 leading-relaxed">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Email content */}
                {(selectedEmail.htmlBody || selectedEmail.body) && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Email Content</p>
                    {selectedEmail.htmlBody ? (
                      <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <iframe
                          srcDoc={selectedEmail.htmlBody}
                          sandbox="allow-same-origin"
                          className="w-full bg-white"
                          style={{ height: "420px", border: "none" }}
                          title="Email content"
                        />
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-4 sm:p-5 border border-gray-200 max-h-72 overflow-y-auto">
                        <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-sans break-words">
                          {selectedEmail.body}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Purpose + Status */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Purpose</p>
                    <p className="text-sm font-semibold text-gray-800">{selectedEmail.purpose}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Status</p>
                    <select value={selectedEmail.status}
                      onChange={e => onStatusChange(selectedEmail.emailId, e.target.value as EmailStatus)}
                      className={`text-xs font-semibold px-2 py-1 rounded-lg ring-1 ring-inset border-0 focus:outline-none cursor-pointer ${STATUS_STYLE[selectedEmail.status]}`}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center text-gray-300 bg-white select-none">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">Select an email to view its AI summary</p>
          </div>
        )}
      </div>
    </div>
  );
}
