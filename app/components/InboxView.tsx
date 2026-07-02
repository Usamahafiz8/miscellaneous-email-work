"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { EmailSummary, EmailStatus, Priority } from "@/lib/types";
import { STATUSES, CATEGORIES, PRIORITIES } from "@/lib/types";
import { formatRelative, formatFull, parseSender, avatarColor } from "@/lib/utils";
import { useDashboard } from "./DashboardProvider";
import DataTable from "./DataTable";
import FilterBar from "./FilterBar";
import PdfViewer from "./PdfViewer";
import EmailInsightsPanel from "./EmailInsightsPanel";
import LinkifiedText from "./LinkifiedText";
import TagInput from "./TagInput";

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
const STATUS_STYLE: Record<EmailStatus, string> = {
  New: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Open: "bg-amber-50 text-amber-700 ring-amber-200",
  Closed: "bg-gray-100 text-gray-500 ring-gray-200",
};
const ACTION_OPTIONS = [
  { value: "Yes", label: "⚡ Action Required" },
  { value: "No", label: "No Action Needed" },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function InboxView() {
  const router = useRouter();
  const pathname = usePathname();
  // Derived directly from the URL rather than passed down from page.tsx params —
  // this component now lives in a layout (see app/inbox/layout.tsx), which Next.js
  // keeps mounted across /inbox <-> /inbox/[emailId] navigations, so all local
  // state (filters, page, search) survives opening/closing an email instead of
  // resetting on every click.
  const selectedId = pathname.startsWith("/inbox/") ? decodeURIComponent(pathname.slice("/inbox/".length)) : undefined;
  const {
    counts, syncEmails, clearAndResync, isSyncing, syncVersion,
    loadingDetailId, loadEmailDetail, getEmailDetail, patchEmail, availableTags,
  } = useDashboard();

  // Filter/sort/page state — drives a server-side fetch, not a client-side filter
  // over an already-loaded list, so filtering is correct across the whole mailbox.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [actionRequired, setActionRequired] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [detailTab, setDetailTab] = useState<"summary" | "email">("summary");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter/search change resets to page 1 — otherwise you could land on
  // an empty page 4 of a filter that now only has 2 pages of results.
  useEffect(() => { setPage(1); }, [debouncedSearch, category, priority, status, actionRequired]);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedSearch) params.set("search", debouncedSearch);
    category.forEach((c) => params.append("category", c));
    priority.forEach((p) => params.append("priority", p));
    status.forEach((s) => params.append("status", s));
    actionRequired.forEach((a) => params.append("actionRequired", a));
    params.set("sortBy", "date");
    params.set("sortOrder", "desc");
    try {
      const res = await fetch(`/api/email/process?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setRows(data.summaries ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, debouncedSearch, category, priority, status, actionRequired]);

  useEffect(() => {
    fetchPage();
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, syncVersion]);

  // Auto-open the first row once, so the split view shows list + detail together
  // without requiring an initial click — "single eye" view of everything at once.
  // Only fires once per session (ref guard): closing the detail afterward must
  // not immediately reopen it.
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (selectedId) { hasAutoSelectedRef.current = true; return; }
    if (rows.length === 0) return;
    hasAutoSelectedRef.current = true;
    router.push(`/inbox/${encodeURIComponent(rows[0].emailId)}`);
  }, [rows, selectedId, router]);

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
      fetchPage();
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : "Resync failed");
    } finally {
      setIsResyncing(false);
    }
  }, [fetchPage]);

  const selectedEmail = useMemo(() => {
    if (!selectedId) return null;
    return getEmailDetail(selectedId) ?? rows.find((r) => r.emailId === selectedId) ?? null;
  }, [selectedId, getEmailDetail, rows]);

  useEffect(() => {
    if (!selectedId) return;
    setDetailTab("summary");
    loadEmailDetail(selectedId);
  }, [selectedId, loadEmailDetail]);

  const handleStatusChange = useCallback((emailId: string, newStatus: EmailStatus) => {
    setRows((prev) => prev.map((r) => (r.emailId === emailId ? { ...r, status: newStatus } : r)));
    patchEmail(emailId, { status: newStatus });
  }, [patchEmail]);

  const handleTagsChange = useCallback((emailId: string, tags: string[]) => {
    setRows((prev) => prev.map((r) => (r.emailId === emailId ? { ...r, tags } : r)));
    patchEmail(emailId, { tags });
  }, [patchEmail]);

  // Mark as read once we know the email's status (works for deep links too).
  useEffect(() => {
    if (selectedEmail && selectedEmail.status === "New") {
      handleStatusChange(selectedEmail.emailId, "Open");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmail?.emailId, selectedEmail?.status]);

  async function bulkMarkStatus(ids: string[], newStatus: EmailStatus) {
    setRows((prev) => prev.map((r) => (ids.includes(r.emailId) ? { ...r, status: newStatus } : r)));
    await Promise.all(ids.map((id) => patchEmail(id, { status: newStatus })));
    fetchPage();
  }

  function handleSelect(email: EmailSummary) {
    router.push(selectedId === email.emailId ? "/inbox" : `/inbox/${encodeURIComponent(email.emailId)}`);
  }

  function clearFilters() {
    setSearchInput("");
    setCategory([]);
    setPriority([]);
    setStatus([]);
    setActionRequired([]);
  }

  const hasFilters = !!(debouncedSearch || category.length || priority.length || status.length || actionRequired.length);

  // Gmail-style single-line row: priority dot, sender, "subject — snippet" (one
  // truncating line), attachment/action glyphs, date — metadata that doesn't fit
  // (category, status, sentiment) lives in the detail pane instead of cluttering the row.
  function renderInboxRow(email: EmailSummary) {
    const sender = parseSender(email.from);
    const isUnread = email.status === "New";
    return (
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[email.priority]}`} title={`${email.priority} priority`} />
        <span className={`w-[170px] flex-shrink-0 truncate text-xs ${isUnread ? "font-semibold text-gray-900" : "text-gray-600"}`}>
          {sender.name}
        </span>
        <span className="flex-1 min-w-0 truncate text-xs">
          <span className={isUnread ? "font-semibold text-gray-900" : "text-gray-700"}>{email.subject || "(No Subject)"}</span>
          <span className="text-gray-400"> — {email.summary}</span>
        </span>
        {email.tags.length > 0 && (
          <span className="flex items-center gap-1 flex-shrink-0">
            {email.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 whitespace-nowrap">{tag}</span>
            ))}
            {email.tags.length > 2 && <span className="text-[10px] text-gray-400">+{email.tags.length - 2}</span>}
          </span>
        )}
        {(email.attachments?.length ?? 0) > 0 && (
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Has attachment">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        )}
        {email.actionRequired === "Yes" && (
          <span className="text-red-500 flex-shrink-0 text-xs" title="Action required">⚡</span>
        )}
        <span className={`w-16 flex-shrink-0 text-right text-xs whitespace-nowrap ${isUnread ? "text-gray-700 font-medium" : "text-gray-400"}`}>
          {formatRelative(email.date)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {pdfMessage && (
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2">
            <span>{pdfMessage}</span>
            <button onClick={() => setPdfMessage(null)} className="ml-4 text-amber-400 hover:text-amber-600">✕</button>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base font-bold text-gray-900">Inbox</h1>
          <p className="text-xs text-gray-400">
            {total} email{total !== 1 ? "s" : ""}
            {counts.unread > 0 && <span className="ml-2 text-indigo-600 font-medium">{counts.unread} unread</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={generatePdfSummaries} disabled={isGeneratingPdf || isSyncing}
            title="Generate AI summaries for PDF attachments in cached emails"
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
          <button
            onClick={clearAndResync} disabled={isSyncing}
            title="Clear all cached summaries and re-sync from scratch"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-600 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="hidden sm:inline">Re-sync All</span>
          </button>
          <button
            onClick={syncEmails} disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {isSyncing
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Sync"}</span>
          </button>
        </div>
      </div>

      {/* ── Split view: narrower list column when an email is open, full-width otherwise ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex flex-col overflow-hidden ${selectedEmail ? "w-[420px] flex-shrink-0 border-r border-gray-200" : "flex-1"}`}>
          <FilterBar
            search={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search emails…"
            filters={[
              { key: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c })), selected: category, onChange: setCategory },
              { key: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: p })), selected: priority, onChange: setPriority },
              { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })), selected: status, onChange: setStatus },
              { key: "actionRequired", label: "Action", options: ACTION_OPTIONS, selected: actionRequired, onChange: setActionRequired },
            ]}
            onClearAll={clearFilters}
            isSearching={searchInput.trim() !== "" && (searchInput !== debouncedSearch || isLoading)}
          />

          <div className="flex-1 overflow-hidden">
            <DataTable
              variant="list"
              renderRow={renderInboxRow}
              rows={rows}
              rowKey={(r) => r.emailId}
              onRowClick={handleSelect}
              isRowSelected={(r) => selectedId === r.emailId}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              bulkActions={[
                { label: "Mark as Open", onRun: (ids) => bulkMarkStatus(ids, "Open") },
                { label: "Mark as Closed", onRun: (ids) => bulkMarkStatus(ids, "Closed") },
              ]}
              pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
              isLoading={isLoading || isSyncing}
              emptyState={
                <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
                  <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-sm">{hasFilters ? "No emails match filters" : "No emails synced yet"}</p>
                  {!hasFilters && (
                    <button onClick={syncEmails} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                      Sync inbox →
                    </button>
                  )}
                </div>
              }
            />
          </div>
        </div>

        {/* ── Reading pane (Gmail-style split, not an overlay) ─────────── */}
        {selectedEmail && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <button onClick={() => router.push("/inbox")} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex-1" />

              <button
                onClick={() => handleResyncEmail(selectedEmail.emailId)}
                disabled={isResyncing}
                title="Re-run AI summarization on this email"
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

              <select
                value={selectedEmail.status}
                onChange={(e) => handleStatusChange(selectedEmail.emailId, e.target.value as EmailStatus)}
                className="text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-gray-600"
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900 leading-snug mb-3">
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
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Tags</p>
                    <TagInput
                      value={selectedEmail.tags}
                      onChange={(tags) => handleTagsChange(selectedEmail.emailId, tags)}
                      placeholder="Add a tag…"
                      suggestions={availableTags}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex border-b border-gray-200 px-5 bg-white flex-shrink-0">
              {(["summary", "email"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`mr-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize
                    ${detailTab === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  {tab === "summary" ? "AI Insights" : "Email"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-5 space-y-5">
                {detailTab === "summary" && <EmailInsightsPanel email={selectedEmail} />}

                {detailTab === "email" && (
                  <>
                    {(selectedEmail.htmlBody || selectedEmail.body) ? (
                      selectedEmail.htmlBody ? (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <iframe
                            srcDoc={selectedEmail.htmlBody}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            className="w-full bg-white"
                            style={{ height: "480px", border: "none" }}
                            title="Email content"
                          />
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 max-h-96 overflow-y-auto">
                          <LinkifiedText
                            text={selectedEmail.body ?? ""}
                            className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words"
                          />
                        </div>
                      )
                    ) : loadingDetailId === selectedEmail.emailId ? (
                      <div className="text-center py-12 text-gray-400">
                        <svg className="w-6 h-6 mx-auto mb-2 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm">Loading email content…</p>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-400">
                        <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm">No email body available</p>
                      </div>
                    )}

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
        )}
      </div>
    </div>
  );
}
