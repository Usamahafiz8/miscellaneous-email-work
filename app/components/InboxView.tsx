"use client";

import { useState, useMemo, useCallback } from "react";
import type { EmailSummary, EmailStatus, Priority } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { formatRelative, formatFull, parseSender, avatarColor } from "@/lib/utils";
import PdfViewer from "./PdfViewer";
import EmailInsightsPanel from "./EmailInsightsPanel";

interface InboxViewProps {
  summaries: EmailSummary[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  onFetch: () => void;
  onClearAndResync: () => void;
  onLoadMore: () => void;
  onStatusChange: (emailId: string, status: EmailStatus) => void;
}

const PRIORITY_DOT: Record<Priority, string> = {
  Critical: "bg-red-500", High: "bg-orange-400", Medium: "bg-yellow-400", Low: "bg-green-400",
};
const PRIORITY_BADGE: Record<Priority, string> = {
  Critical: "bg-red-50 text-red-600 ring-red-200",
  High: "bg-orange-50 text-orange-600 ring-orange-200",
  Medium: "bg-yellow-50 text-yellow-700 ring-yellow-200",
  Low: "bg-green-50 text-green-700 ring-green-200",
};
const CATEGORY_BADGE: Record<string, string> = {
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
  positive: "text-emerald-600 bg-emerald-50 ring-emerald-200",
  neutral: "text-gray-500 bg-gray-100 ring-gray-200",
  negative: "text-red-500 bg-red-50 ring-red-200",
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function InboxView({
  summaries, isLoading, isLoadingMore, hasMore, totalCount,
  onFetch, onClearAndResync, onLoadMore, onStatusChange,
}: InboxViewProps) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selected, setSelected] = useState<EmailSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"summary" | "email">("summary");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);

  const generatePdfSummaries = useCallback(async () => {
    setIsGeneratingPdf(true);
    setPdfMessage(null);
    try {
      const res = await fetch("/api/email/pdf-summaries", { method: "POST" });
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed");
      setPdfMessage(
        data.processed > 0
          ? `PDF summaries generated for ${data.processed} of ${data.total} email${data.total !== 1 ? "s" : ""} — click Sync to refresh`
          : "No PDF attachments found in cached emails"
      );
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : "Failed to generate PDF summaries");
    } finally {
      setIsGeneratingPdf(false);
    }
  }, []);

  const handleResyncEmail = useCallback(async (emailId: string) => {
    setIsResyncing(true);
    try {
      const res = await fetch("/api/email/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Resync failed");
      // Trigger a DB reload so the updated summary appears
      onFetch();
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : "Resync failed");
    } finally {
      setIsResyncing(false);
    }
  }, [onFetch]);

  const filtered = useMemo(() => summaries.filter((s) => {
    if (filterCategory && s.category !== filterCategory) return false;
    if (filterPriority && s.priority !== filterPriority) return false;
    if (filterAction && s.actionRequired !== filterAction) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.subject.toLowerCase().includes(q)
        || s.from.toLowerCase().includes(q)
        || s.summary.toLowerCase().includes(q);
    }
    return true;
  }), [summaries, search, filterCategory, filterPriority, filterAction, filterStatus]);

  const selectedEmail = useMemo(
    () => selected ? (summaries.find(s => s.emailId === selected.emailId) ?? selected) : null,
    [summaries, selected]
  );

  function handleSelect(email: EmailSummary) {
    if (selected?.emailId === email.emailId) { setSelected(null); return; }
    setSelected(email);
    setDetailTab("summary");
    // Auto-mark as read
    if (email.status === "New") onStatusChange(email.emailId, "Open");
  }

  const hasFilters = search || filterCategory || filterPriority || filterAction || filterStatus;
  const unreadCount = summaries.filter(s => s.status === "New").length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* PDF summary feedback banner */}
      {pdfMessage && (
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2">
            <span>{pdfMessage}</span>
            <button onClick={() => setPdfMessage(null)} className="ml-4 text-amber-400 hover:text-amber-600">✕</button>
          </div>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search emails…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
            />
          </div>

          {/* Filters */}
          {["Category", "Priority"].map((label) => (
            <select
              key={label}
              value={label === "Category" ? filterCategory : filterPriority}
              onChange={e => label === "Category" ? setFilterCategory(e.target.value) : setFilterPriority(e.target.value)}
              className="hidden sm:block text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            >
              <option value="">{label}</option>
              {label === "Category"
                ? ["Hiring","Client Support","Sales","Finance","Internal","Marketing","Technical","General"].map(c => <option key={c}>{c}</option>)
                : ["Critical","High","Medium","Low"].map(p => <option key={p}>{p}</option>)
              }
            </select>
          ))}

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="hidden sm:block text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
            <option value="">All</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>

          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setFilterCategory(""); setFilterPriority(""); setFilterAction(""); setFilterStatus(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg border border-gray-200 bg-gray-50 transition-colors"
            >
              Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded-full">
                {unreadCount} unread
              </span>
            )}
            {/* Generate PDF Summaries for already-cached emails */}
            <button
              onClick={generatePdfSummaries} disabled={isGeneratingPdf || isLoading}
              title="Generate AI summaries for PDF attachments in cached emails (no IMAP needed)"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-700 text-sm font-medium transition-colors"
            >
              {isGeneratingPdf
                ? <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
              }
              <span className="hidden sm:inline">{isGeneratingPdf ? "Generating…" : "PDF Summaries"}</span>
            </button>
            {/* Re-sync All */}
            <button
              onClick={onClearAndResync} disabled={isLoading}
              title="Clear all cached summaries and re-sync from scratch"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-600 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">Re-sync All</span>
            </button>
            <button
              onClick={onFetch} disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {isLoading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              }
              <span className="hidden sm:inline">{isLoading ? "Syncing…" : "Sync"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Email list ──────────────────────────────────────────── */}
        <div className={`flex flex-col overflow-hidden border-r border-gray-200 bg-white transition-all
          ${selectedEmail ? "hidden md:flex md:w-[320px] lg:w-[360px] flex-shrink-0" : "flex-1"}`}>

          {/* List header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {filtered.length} of {summaries.length}{totalCount > summaries.length ? ` · ${totalCount} total` : ""}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Syncing inbox…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-sm">{summaries.length === 0 ? "No emails synced yet" : "No emails match filters"}</p>
                {summaries.length === 0 && (
                  <button onClick={onFetch} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                    Sync inbox →
                  </button>
                )}
              </div>
            ) : (
              filtered.map((email) => {
                const isSelected = selectedEmail?.emailId === email.emailId;
                const isUnread = email.status === "New";
                return (
                  <button
                    key={email.emailId}
                    onClick={() => handleSelect(email)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors border-l-2
                      ${isSelected ? "bg-indigo-50 border-indigo-500" : "bg-white hover:bg-gray-50 border-transparent"}`}
                  >
                    {/* Unread dot */}
                    <div className="mt-2 w-2 flex-shrink-0">
                      {isUnread && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </div>

                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 ${avatarColor(email.from)}`}>
                      {parseSender(email.from).initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className={`text-sm truncate ${isUnread ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                          {parseSender(email.from).name}
                        </span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{formatRelative(email.date)}</span>
                      </div>

                      {/* Sender email address */}
                      <p className="text-[11px] text-gray-400 truncate mb-1">{parseSender(email.from).email}</p>

                      {/* Subject */}
                      <p className={`text-xs truncate mb-2 ${isUnread ? "font-semibold text-gray-800" : "font-medium text-gray-600"}`}>
                        {email.subject || "(No Subject)"}
                      </p>

                      {/* AI Summary — up to 3 lines */}
                      <p className="text-[11px] text-gray-500 line-clamp-3 leading-relaxed mb-2">
                        {email.summary}
                      </p>

                      {/* Key points as chips */}
                      {email.keyPoints.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {email.keyPoints.slice(0, 4).map((pt, i) => (
                            <span key={i} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium leading-tight max-w-[160px] truncate">
                              {pt}
                            </span>
                          ))}
                          {email.keyPoints.length > 4 && (
                            <span className="text-[10px] text-gray-400 py-0.5">+{email.keyPoints.length - 4} more</span>
                          )}
                        </div>
                      )}

                      {/* PDF summary indicator */}
                      {email.attachmentSummary && (
                        <p className="text-[10px] text-amber-600 font-medium mb-1.5 flex items-center gap-1">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          PDF summary available
                        </p>
                      )}

                      {/* Tags row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_BADGE[email.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                          {email.category}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[email.priority]}`} />
                          {email.priority}
                        </span>
                        {email.actionRequired === "Yes" && (
                          <span className="text-[10px] font-semibold text-red-500">⚡ Action</span>
                        )}
                        {(email.attachments?.length ?? 0) > 0 && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            {email.attachments!.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}

            {(hasMore || isLoadingMore) && (
              <div className="p-4 flex justify-center border-t border-gray-100">
                <button onClick={onLoadMore} disabled={isLoadingMore}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                  {isLoadingMore
                    ? <><div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />Loading…</>
                    : <>Load more <span className="text-gray-400">({summaries.length} / {totalCount})</span></>
                  }
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Detail panel ────────────────────────────────────────── */}
        {selectedEmail ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-white absolute inset-0 md:static md:inset-auto">

            {/* Detail header / actions */}
            <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <button onClick={() => setSelected(null)}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="md:hidden text-xs">Back</span>
              </button>

              <div className="flex-1" />

              {/* Re-process AI for this single email */}
              <button
                onClick={() => handleResyncEmail(selectedEmail.emailId)}
                disabled={isResyncing}
                title="Re-run AI summarization on this email (no IMAP)"
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
              >
                {isResyncing
                  ? <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                }
                Re-process AI
              </button>

              {/* Status picker */}
              <select
                value={selectedEmail.status}
                onChange={e => onStatusChange(selectedEmail.emailId, e.target.value as EmailStatus)}
                className="text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-gray-600"
              >
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* Email header */}
            <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900 leading-snug mb-4">
                {selectedEmail.subject || "(No Subject)"}
              </h2>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(selectedEmail.from)}`}>
                  {parseSender(selectedEmail.from).initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{parseSender(selectedEmail.from).name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">&lt;{parseSender(selectedEmail.from).email}&gt;</span>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatFull(selectedEmail.date)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_BADGE[selectedEmail.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                      {selectedEmail.category}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${PRIORITY_BADGE[selectedEmail.priority]}`}>
                      {selectedEmail.priority}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset capitalize ${SENTIMENT_STYLE[selectedEmail.sentiment]}`}>
                      {selectedEmail.sentiment}
                    </span>
                    {selectedEmail.actionRequired === "Yes" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset bg-red-50 text-red-600 ring-red-200">
                        Action Required
                      </span>
                    )}
                    {(selectedEmail.attachments?.length ?? 0) > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset bg-gray-100 text-gray-600 ring-gray-200">
                        {selectedEmail.attachments!.length} PDF attachment{selectedEmail.attachments!.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-4 sm:px-6 bg-white flex-shrink-0">
              {(["summary", "email"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`mr-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize
                    ${detailTab === tab
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                >
                  {tab === "summary" ? "AI Insights" : "Email"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 sm:px-6 py-5 max-w-2xl mx-auto space-y-5">

                {detailTab === "summary" && (
                  <EmailInsightsPanel email={selectedEmail} />
                )}

                {detailTab === "email" && (
                  <>
                    {(selectedEmail.htmlBody || selectedEmail.body) ? (
                      selectedEmail.htmlBody ? (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <iframe
                            srcDoc={selectedEmail.htmlBody}
                            sandbox=""
                            className="w-full bg-white"
                            style={{ height: "500px", border: "none" }}
                            title="Email content"
                          />
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 max-h-96 overflow-y-auto">
                          <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words">
                            {selectedEmail.body}
                          </pre>
                        </div>
                      )
                    ) : (
                      <div className="text-center py-12 text-gray-400">
                        <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm">No email body available</p>
                      </div>
                    )}

                    {/* PDF Attachments */}
                    {(selectedEmail.attachments?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                          Attachments ({selectedEmail.attachments!.length})
                        </p>
                        <div className="space-y-3">
                          {selectedEmail.attachments!.map((att, i) => (
                            <PdfViewer key={i} attachment={att} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center text-gray-300 bg-gray-50 select-none">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Select an email to read it</p>
            <p className="text-xs text-gray-300 mt-1">AI insights appear alongside the original</p>
          </div>
        )}
      </div>
    </div>
  );
}
