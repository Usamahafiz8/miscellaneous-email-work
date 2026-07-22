"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { EmailSummary, EmailStatus, Priority } from "@/lib/types";
import { STATUSES, CATEGORIES, PRIORITIES } from "@/lib/types";
import { formatRelative, formatFull, parseSender, avatarColor } from "@/lib/utils";
import { useDashboard } from "./DashboardProvider";
import DataTable, { type ColumnDef, type DataTableSort } from "./DataTable";
import FilterBar from "./FilterBar";
import DateRangeFilter from "./DateRangeFilter";
import FilterPresetsMenu from "./FilterPresetsMenu";
import PdfViewer from "./PdfViewer";
import EmailInsightsPanel from "./EmailInsightsPanel";
import LinkifiedText from "./LinkifiedText";
import TagInput from "./TagInput";
import DetailLoadingSkeleton from "./DetailLoadingSkeleton";

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

// ─── Grid columns: full set for full-width inbox, condensed set for the ────
// narrow 420px split-view column when an email is open beside the reading pane.
const FULL_INBOX_COLUMNS: ColumnDef<EmailSummary>[] = [
  {
    key: "date", header: "Date", sortable: true, width: "100px",
    render: (r) => (
      <span className={`text-xs whitespace-nowrap ${r.status === "New" ? "text-gray-700 font-medium" : "text-gray-400"}`}>
        {formatRelative(r.date)}
      </span>
    ),
  },
  {
    key: "from", header: "Sender", width: "170px",
    render: (r) => (
      <span className={`truncate block text-xs ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {parseSender(r.from).name}
      </span>
    ),
  },
  {
    key: "subject", header: "Subject",
    render: (r) => (
      <span className={`truncate block text-xs ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-700"}`}>
        {r.subject || "(No Subject)"}
      </span>
    ),
  },
  {
    key: "summary", header: "AI Summary", width: "280px",
    render: (r) => r.summarized === false
      ? <span className="block text-xs italic text-gray-400 py-1">Not summarized yet — open to generate</span>
      : <span className="block text-xs text-gray-600 whitespace-normal break-words leading-relaxed py-1">{r.summary}</span>,
  },
  {
    key: "category", header: "Category", width: "120px",
    headerHint: "What kind of email this is (Hiring, Sales, Support, etc.), decided by AI",
    render: (r) => r.summarized === false
      ? <span className="text-[10px] text-gray-300">—</span>
      : (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset whitespace-nowrap ${CATEGORY_BADGE[r.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
          {r.category}
        </span>
      ),
  },
  {
    key: "priority", header: "Priority", width: "110px",
    headerHint: "How urgent this email is, from Critical (most) to Low (least)",
    render: (r) => r.summarized === false
      ? <span className="text-[10px] text-gray-300">—</span>
      : (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_BADGE[r.priority]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[r.priority]}`} />
          {r.priority}
        </span>
      ),
  },
  {
    key: "actionRequired", header: "Action", width: "90px",
    headerHint: "Does this email need a reply or task from you?",
    render: (r) => r.actionRequired === "Yes"
      ? <span className="text-red-500 text-xs whitespace-nowrap" title="Action required">⚡ Yes</span>
      : <span className="text-gray-300 text-xs">—</span>,
  },
  {
    key: "status", header: "Status", width: "110px",
    headerHint: "New = unread, Open = you're working on it, Closed = done",
    render: (r) => (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[r.status]}`}>
        {r.status}
      </span>
    ),
  },
];

const NARROW_INBOX_COLUMNS: ColumnDef<EmailSummary>[] = [
  {
    key: "priority", header: "", width: "24px",
    render: (r) => <span className={`w-1.5 h-1.5 rounded-full inline-block ${PRIORITY_DOT[r.priority]}`} title={`${r.priority} priority`} />,
  },
  {
    key: "from", header: "Sender", width: "110px",
    render: (r) => (
      <span className={`truncate block text-xs ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {parseSender(r.from).name}
      </span>
    ),
  },
  {
    key: "subject", header: "Subject",
    render: (r) => (
      <span className={`truncate block text-xs ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-700"}`}>
        {r.subject || "(No Subject)"}
      </span>
    ),
  },
  {
    key: "date", header: "Date", width: "50px",
    render: (r) => <span className="text-xs text-gray-400 whitespace-nowrap">{formatRelative(r.date)}</span>,
  },
];

interface InboxFilterBag {
  search: string;
  category: string[];
  priority: string[];
  status: string[];
  actionRequired: string[];
  dateFrom?: string;
  dateTo?: string;
}

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
    counts, syncEmails, clearAndResync, fetchAllEmails, isSyncing, syncVersion,
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
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<DataTableSort>({ field: "date", order: "desc" });

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
  useEffect(() => { setPage(1); }, [debouncedSearch, category, priority, status, actionRequired, dateFrom, dateTo, sort]);

  // Guards against a slow, stale request (e.g. an earlier search term) resolving
  // after a newer one and overwriting the current rows/total with old data —
  // only the response matching the most-recently-issued request is applied.
  const fetchRequestIdRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedSearch) params.set("search", debouncedSearch);
    category.forEach((c) => params.append("category", c));
    priority.forEach((p) => params.append("priority", p));
    status.forEach((s) => params.append("status", s));
    actionRequired.forEach((a) => params.append("actionRequired", a));
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("sortBy", sort.field);
    params.set("sortOrder", sort.order);
    try {
      const res = await fetch(`/api/email/process?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (requestId !== fetchRequestIdRef.current) return; // superseded by a newer request
      if (res.ok && data?.success) {
        setRows(data.summaries ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) setIsLoading(false);
    }
  }, [page, pageSize, debouncedSearch, category, priority, status, actionRequired, dateFrom, dateTo, sort]);

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
          ? `Summarized attachments for ${data.processed} of ${data.total} email${data.total !== 1 ? "s" : ""} — click Sync to see them`
          : "No attachments found to summarize in your synced emails"
      );
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : "Couldn't summarize attachments — please try again");
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

  // When a lazily-summarized email finishes (its detail-cache entry flips to
  // summarized), fold the AI fields back into the matching list row so it leaves
  // the "pending" state in place — no full-page refetch needed.
  const selectedDetail = selectedId ? getEmailDetail(selectedId) : undefined;
  useEffect(() => {
    if (!selectedDetail || selectedDetail.summarized === false) return;
    setRows((prev) => prev.map((r) =>
      r.emailId === selectedDetail.emailId && r.summarized === false
        ? {
            ...r,
            summarized: true,
            summary: selectedDetail.summary,
            keyPoints: selectedDetail.keyPoints,
            sentiment: selectedDetail.sentiment,
            category: selectedDetail.category,
            priority: selectedDetail.priority,
            actionRequired: selectedDetail.actionRequired,
            purpose: selectedDetail.purpose,
            attachmentSummary: selectedDetail.attachmentSummary,
          }
        : r
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDetail?.emailId, selectedDetail?.summarized]);

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
    setDateFrom(undefined);
    setDateTo(undefined);
  }

  const hasFilters = !!(debouncedSearch || category.length || priority.length || status.length || actionRequired.length || dateFrom || dateTo);

  const currentFilterBag: InboxFilterBag = { search: searchInput, category, priority, status, actionRequired, dateFrom, dateTo };
  function applyFilterPreset(f: InboxFilterBag) {
    setSearchInput(f.search);
    setCategory(f.category);
    setPriority(f.priority);
    setStatus(f.status);
    setActionRequired(f.actionRequired);
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {pdfMessage && (
        <div className="px-4 pt-3 flex-shrink-0 animate-banner-in">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2">
            <span>{pdfMessage}</span>
            <button onClick={() => setPdfMessage(null)} aria-label="Dismiss" className="ml-4 text-amber-400 hover:text-amber-600">✕</button>
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
            title="Read attached resumes/documents (PDFs) and summarize them with AI"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-700 text-sm font-medium transition-colors"
          >
            {isGeneratingPdf
              ? <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            }
            <span className="hidden sm:inline">{isGeneratingPdf ? "Reading attachments…" : "Summarize Attachments"}</span>
          </button>
          <button
            onClick={clearAndResync} disabled={isSyncing}
            title="Erase all saved AI summaries and regenerate them from scratch — use this if the summaries look wrong"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-600 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="hidden sm:inline">Rebuild All Summaries</span>
          </button>
          <button
            onClick={fetchAllEmails} disabled={isSyncing}
            title="Go through your entire mailbox and import every email, not just the newest ones"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H6a2 2 0 00-2 2z" />
            </svg>
            <span className="hidden sm:inline">Import Entire Mailbox</span>
          </button>
          <button
            onClick={syncEmails} disabled={isSyncing}
            title="Check for new emails since your last sync"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition active:scale-[0.98]"
          >
            {isSyncing
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Sync"}</span>
          </button>
        </div>
      </div>

      {/* ── Split view: narrower list column when an email is open, full-width otherwise.
          Below md: the list and reading pane never share the screen — opening an
          email hides the list entirely instead of squeezing both into too little
          width. At md: and up this is unchanged (side-by-side split). ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-col overflow-hidden ${selectedEmail ? "hidden md:flex md:w-[420px] md:flex-shrink-0 md:border-r md:border-gray-200" : "flex flex-1"}`}>
          <FilterBar
            search={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search by sender, subject, or keyword…"
            filters={[
              { key: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c })), selected: category, onChange: setCategory },
              { key: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: p })), selected: priority, onChange: setPriority },
              { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })), selected: status, onChange: setStatus },
              { key: "actionRequired", label: "Action", options: ACTION_OPTIONS, selected: actionRequired, onChange: setActionRequired },
            ]}
            onClearAll={clearFilters}
            extraFilters={<DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />}
            extraFiltersActive={!!(dateFrom || dateTo)}
            rightSlot={<FilterPresetsMenu storageKey="filterPresets:inbox" currentFilters={currentFilterBag} onApply={applyFilterPreset} />}
            isLoading={isLoading || searchInput !== debouncedSearch}
          />

          <div className="flex-1 overflow-hidden">
            <DataTable
              variant="grid"
              columns={selectedEmail ? NARROW_INBOX_COLUMNS : FULL_INBOX_COLUMNS}
              rows={rows}
              rowKey={(r) => r.emailId}
              onRowClick={handleSelect}
              isRowSelected={(r) => selectedId === r.emailId}
              sort={sort}
              onSortChange={setSort}
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
                  <p className="text-sm">{hasFilters ? "No emails match your filters" : "Your inbox is empty"}</p>
                  {hasFilters ? (
                    <button onClick={clearFilters} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                      Clear filters →
                    </button>
                  ) : (
                    <button onClick={syncEmails} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                      Sync now to fetch your emails →
                    </button>
                  )}
                </div>
              }
            />
          </div>
        </div>

        {/* ── Reading pane (Gmail-style split, not an overlay) ─────────── */}
        {selectedEmail && (
          <div key={selectedEmail.emailId} className="flex-1 flex flex-col overflow-hidden bg-white animate-panel-in">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <button onClick={() => router.push("/inbox")} aria-label="Close email" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex-1" />

              <button
                onClick={() => handleResyncEmail(selectedEmail.emailId)}
                disabled={isResyncing}
                title="Generate a fresh AI summary for this email — use this if the summary looks off"
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
              >
                {isResyncing
                  ? <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                }
                Refresh Summary
              </button>

              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                Status
                <select
                  value={selectedEmail.status}
                  onChange={(e) => handleStatusChange(selectedEmail.emailId, e.target.value as EmailStatus)}
                  title="New = unread, Open = you're working on it, Closed = done"
                  className="text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-gray-600"
                >
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
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
                    {/* AI-derived badges are hidden until the email is summarized —
                        otherwise a pending email would flash placeholder values. */}
                    {selectedEmail.summarized !== false && (
                      <>
                        <span title="What kind of email this is, decided by AI" className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_BADGE[selectedEmail.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                          {selectedEmail.category}
                        </span>
                        <span title="How urgent this email is" className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${PRIORITY_BADGE[selectedEmail.priority]}`}>
                          {selectedEmail.priority}
                        </span>
                        <span title="The overall tone of this email" className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset capitalize ${SENTIMENT_STYLE[selectedEmail.sentiment]}`}>
                          {selectedEmail.sentiment}
                        </span>
                      </>
                    )}
                    {selectedEmail.actionRequired === "Yes" && (
                      <span title="This email needs a reply or task from you" className="text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset bg-red-50 text-red-600 ring-red-200">
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
                {detailTab === "summary" && (
                  selectedEmail.summarized === false ? (
                    loadingDetailId === selectedEmail.emailId ? (
                      <DetailLoadingSkeleton message="Generating AI summary… emails are summarized the first time you open them." />
                    ) : (
                      <div className="text-center py-12 text-gray-400">
                        <p className="text-sm">No AI summary yet.</p>
                        <p className="text-xs text-gray-300 mt-1">Use “Refresh Summary” above to generate one.</p>
                      </div>
                    )
                  ) : (
                    <EmailInsightsPanel email={selectedEmail} />
                  )
                )}

                {detailTab === "email" && (
                  <>
                    {(selectedEmail.htmlBody || selectedEmail.body) ? (
                      selectedEmail.htmlBody ? (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <iframe
                            srcDoc={selectedEmail.htmlBody}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            className="w-full bg-white"
                            style={{ height: "min(70vh, 800px)", border: "none" }}
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
                      <DetailLoadingSkeleton message="Loading email content…" />
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
