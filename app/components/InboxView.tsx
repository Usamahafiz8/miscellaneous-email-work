"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { EmailSummary, EmailStatus, Priority } from "@/lib/types";
import { STATUSES, CATEGORIES, PRIORITIES } from "@/lib/types";
import { formatRelative, formatFull, parseSender, avatarColor } from "@/lib/utils";
import { isTypingTarget, isGSequenceKey } from "@/lib/keyboard";
import { useElementWidth } from "@/hooks/useElementWidth";
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
import SplitPane from "./ui/SplitPane";
import OverflowMenu from "./ui/OverflowMenu";

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

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "date:desc", label: "Newest first" },
  { value: "date:asc", label: "Oldest first" },
  // priorityRank, not "priority" — the string column sorts alphabetically
  // (Critical, High, Low, Medium); the rank column sorts by actual urgency.
  { value: "priorityRank:asc", label: "Most urgent first" },
  { value: "from:asc", label: "Sender A–Z" },
  { value: "subject:asc", label: "Subject A–Z" },
];

// ─── Grid columns ───────────────────────────────────────────────────────────
// Three sets, picked from the *measured* width of the list pane rather than a
// single "is anything selected" flag. Drag the split wider and the list earns
// back the AI-summary and status columns instead of staying stuck at three.

const FULL_INBOX_COLUMNS: ColumnDef<EmailSummary>[] = [
  {
    key: "date", header: "Date", sortable: true, width: "92px",
    render: (r) => (
      <span className={`whitespace-nowrap ${r.status === "New" ? "text-gray-700 font-medium" : "text-gray-400"}`}>
        {formatRelative(r.date)}
      </span>
    ),
  },
  {
    key: "from", header: "Sender", sortable: true, width: "168px",
    render: (r) => (
      <span className={`truncate block ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {parseSender(r.from).name}
      </span>
    ),
  },
  {
    key: "subject", header: "Subject", sortable: true,
    render: (r) => (
      <span className={`truncate block ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-700"}`}>
        {r.subject || "(No Subject)"}
      </span>
    ),
  },
  {
    key: "summary", header: "AI Summary", width: "320px",
    render: (r) => r.summarized === false
      ? <span className="block italic text-gray-400">Not summarized yet — open to generate</span>
      : <span className="block text-gray-600 whitespace-normal break-words leading-relaxed line-clamp-2">{r.summary}</span>,
  },
  {
    key: "category", header: "Category", width: "116px",
    headerHint: "What kind of email this is (Hiring, Sales, Support, etc.), decided by AI",
    render: (r) => r.summarized === false
      ? <span className="text-gray-300">—</span>
      : (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset whitespace-nowrap ${CATEGORY_BADGE[r.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
          {r.category}
        </span>
      ),
  },
  {
    key: "priorityRank", header: "Priority", sortable: true, width: "104px",
    headerHint: "How urgent this email is, from Critical (most) to Low (least)",
    render: (r) => r.summarized === false
      ? <span className="text-gray-300">—</span>
      : (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_BADGE[r.priority]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[r.priority]}`} />
          {r.priority}
        </span>
      ),
  },
  {
    key: "actionRequired", header: "Action", width: "78px",
    headerHint: "Does this email need a reply or task from you?",
    render: (r) => r.actionRequired === "Yes"
      ? <span className="text-red-500 whitespace-nowrap" title="Action required">⚡ Yes</span>
      : <span className="text-gray-300">—</span>,
  },
  {
    key: "status", header: "Status", width: "96px",
    headerHint: "New = unread, Open = you're working on it, Closed = done",
    render: (r) => (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[r.status]}`}>
        {r.status}
      </span>
    ),
  },
];

const MEDIUM_INBOX_COLUMNS: ColumnDef<EmailSummary>[] = [
  {
    key: "priority", header: "", width: "26px",
    render: (r) => <span className={`w-1.5 h-1.5 rounded-full inline-block ${PRIORITY_DOT[r.priority]}`} title={`${r.priority} priority`} />,
  },
  {
    key: "from", header: "Sender", sortable: true, width: "140px",
    render: (r) => (
      <span className={`truncate block ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {parseSender(r.from).name}
      </span>
    ),
  },
  {
    key: "subject", header: "Subject", sortable: true,
    render: (r) => (
      <span className={`truncate block ${r.status === "New" ? "font-semibold text-gray-900" : "text-gray-700"}`}>
        {r.subject || "(No Subject)"}
      </span>
    ),
  },
  {
    key: "category", header: "Category", width: "112px",
    render: (r) => r.summarized === false
      ? <span className="text-gray-300">—</span>
      : (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset whitespace-nowrap ${CATEGORY_BADGE[r.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
          {r.category}
        </span>
      ),
  },
  {
    key: "date", header: "Date", sortable: true, width: "72px",
    render: (r) => <span className="text-gray-400 whitespace-nowrap">{formatRelative(r.date)}</span>,
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

type ListTier = "narrow" | "medium" | "full";

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
    loadingDetailId, loadEmailDetail, getEmailDetail, patchEmail, availableTags, notify,
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
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<DataTableSort>({ field: "date", order: "desc" });

  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [detailTab, setDetailTab] = useState<"summary" | "email">("summary");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);

  // Which column set fits the list pane right now, updated live as the split
  // divider is dragged. Stored as a tier (not raw px) so a drag only triggers a
  // real re-render when it actually crosses a threshold.
  const [listTier, setListTier] = useState<ListTier>("full");
  const handleListWidth = useCallback((w: number) => {
    setListTier(w >= 880 ? "full" : w >= 560 ? "medium" : "narrow");
  }, []);

  const searchRef = useRef<HTMLInputElement>(null);

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
    try {
      const res = await fetch("/api/email/pdf-summaries", { method: "POST" });
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed");
      notify(
        data.processed > 0
          ? `Summarized attachments for ${data.processed} of ${data.total} email${data.total !== 1 ? "s" : ""} — click Sync to see them`
          : "No attachments found to summarize in your synced emails",
        data.processed > 0 ? "success" : "info"
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't summarize attachments — please try again", "error");
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [notify]);

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
      notify(err instanceof Error ? err.message : "Resync failed", "error");
    } finally {
      setIsResyncing(false);
    }
  }, [fetchPage, notify]);

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

  // ── Row-to-row navigation (j / k, and the ↑↓ buttons in the reading pane) ──
  const currentIndex = useMemo(
    () => (selectedId ? rows.findIndex((r) => r.emailId === selectedId) : -1),
    [rows, selectedId]
  );

  const goRelative = useCallback((delta: number) => {
    if (rows.length === 0) return;
    const next = currentIndex === -1 ? 0 : currentIndex + delta;
    if (next < 0 || next >= rows.length) return;
    router.push(`/inbox/${encodeURIComponent(rows[next].emailId)}`);
  }, [rows, currentIndex, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        // Esc gets you out of the search box without touching the mouse.
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      // `j` is also the tail of "g j" (→ Jobs); let that win.
      if (isGSequenceKey()) return;

      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "Escape" && selectedId) { e.preventDefault(); router.push("/inbox"); return; }

      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); goRelative(1); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); goRelative(-1); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goRelative, selectedId, router]);

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

  // Gmail-style two-line row for the narrow pane — a 5-column table crammed
  // into 400px is unreadable, but this shows strictly more information (sender,
  // subject, date, priority, category *and* a summary snippet) in the same space.
  function renderCompactRow(email: EmailSummary) {
    const sender = parseSender(email.from);
    const unread = email.status === "New";
    return (
      <div className="flex items-start gap-2 min-w-0">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[7px] ${PRIORITY_DOT[email.priority]}`}
          title={`${email.priority} priority`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`flex-1 min-w-0 truncate text-xs ${unread ? "font-semibold text-gray-900" : "text-gray-600"}`}>
              {sender.name}
            </span>
            <span className="flex-shrink-0 text-[10px] text-gray-400 whitespace-nowrap">{formatRelative(email.date)}</span>
          </div>
          <p className={`truncate text-xs mt-0.5 ${unread ? "font-medium text-gray-800" : "text-gray-600"}`}>
            {email.subject || "(No Subject)"}
          </p>
          {email.summarized !== false && email.summary && (
            <p className="truncate text-[11px] text-gray-400 mt-0.5">{email.summary}</p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full ring-1 ring-inset ${CATEGORY_BADGE[email.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
              {email.category}
            </span>
            {email.actionRequired === "Yes" && (
              <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-red-50 text-red-600 ring-1 ring-inset ring-red-200">Action</span>
            )}
            {(email.attachments?.length ?? 0) > 0 && (
              <span className="text-[9px] text-gray-400" title="Has attachments">📎</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Below the widest tier the list pane is too narrow to lay filters out
  // inline — FilterBar collapses them behind one button instead of wrapping
  // onto three rows.
  const isCompactBar = listTier !== "full";

  const listPane = (
    <>
      <FilterBar
        compact={isCompactBar}
        leading={
          <div className="flex items-baseline gap-1.5 flex-shrink-0 mr-0.5">
            <h1 className="text-sm font-bold text-gray-900">Inbox</h1>
            <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
              {total.toLocaleString()}
              {counts.unread > 0 && <span className="ml-1.5 text-indigo-600 font-semibold">{counts.unread} new</span>}
            </span>
          </div>
        }
        search={searchInput}
        onSearchChange={setSearchInput}
        searchInputRef={searchRef}
        searchPlaceholder="Search sender, subject, keyword…  (/)"
        filters={[
          { key: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c })), selected: category, onChange: setCategory },
          { key: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: p })), selected: priority, onChange: setPriority },
          { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })), selected: status, onChange: setStatus },
          { key: "actionRequired", label: "Action", options: ACTION_OPTIONS, selected: actionRequired, onChange: setActionRequired },
        ]}
        onClearAll={clearFilters}
        extraFilters={
          <>
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
            {/* The compact list variant has no sortable column headers, so it
                gets an explicit sort control rather than silently losing the
                ability to reorder. FilterBar tucks this into its popover when
                the bar is collapsed. */}
            {isCompactBar && (
              <select
                value={`${sort.field}:${sort.order}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split(":");
                  setSort({ field, order: order as "asc" | "desc" });
                }}
                aria-label="Sort emails"
                title="Sort the list"
                className="h-8 text-[13px] rounded-lg border border-gray-200 bg-white px-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </>
        }
        extraFiltersActive={!!(dateFrom || dateTo)}
        rightSlot={
          <>
            <FilterPresetsMenu storageKey="filterPresets:inbox" currentFilters={currentFilterBag} onApply={applyFilterPreset} />
            <OverflowMenu
              items={[
                {
                  label: "Summarize Attachments",
                  description: "Read attached resumes/PDFs and summarize them with AI",
                  onSelect: generatePdfSummaries,
                  busy: isGeneratingPdf,
                  disabled: isSyncing,
                  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                },
                {
                  label: "Import Entire Mailbox",
                  description: "Page through every message, not just the newest",
                  onSelect: fetchAllEmails,
                  disabled: isSyncing,
                  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H6a2 2 0 00-2 2z" /></svg>,
                },
                {
                  label: "Rebuild All Summaries",
                  description: "Erase saved summaries and regenerate from scratch",
                  onSelect: clearAndResync,
                  disabled: isSyncing,
                  danger: true,
                  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                },
              ]}
            />
            <button
              onClick={syncEmails} disabled={isSyncing}
              title="Check for new emails since your last sync"
              className={`flex items-center gap-1.5 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[13px] font-medium transition active:scale-[0.98] ${isCompactBar ? "w-8 justify-center" : "px-2.5"}`}
            >
              {isSyncing
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              }
              {!isCompactBar && <span>{isSyncing ? "Syncing…" : "Sync"}</span>}
            </button>
          </>
        }
        isLoading={isLoading || searchInput !== debouncedSearch}
      />

      <div className="flex-1 overflow-hidden min-h-0">
        <DataTable
          variant={listTier === "narrow" ? "list" : "grid"}
          columns={listTier === "full" ? FULL_INBOX_COLUMNS : MEDIUM_INBOX_COLUMNS}
          renderRow={renderCompactRow}
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
          isLoading={isLoading}
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
    </>
  );

  const readingPane = selectedEmail ? (
    <ReadingPane
      key={selectedEmail.emailId}
      email={selectedEmail}
      position={currentIndex >= 0 ? { index: currentIndex, total: rows.length } : null}
      onPrev={() => goRelative(-1)}
      onNext={() => goRelative(1)}
      onClose={() => router.push("/inbox")}
      detailTab={detailTab}
      onTabChange={setDetailTab}
      onResync={() => handleResyncEmail(selectedEmail.emailId)}
      isResyncing={isResyncing}
      isLoadingDetail={loadingDetailId === selectedEmail.emailId}
      onStatusChange={(s) => handleStatusChange(selectedEmail.emailId, s)}
      onTagsChange={(tags) => handleTagsChange(selectedEmail.emailId, tags)}
      availableTags={availableTags}
    />
  ) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <SplitPane
        storageKey="split:inbox"
        left={listPane}
        right={readingPane}
        defaultLeftWidth={480}
        minLeftWidth={280}
        minRightWidth={420}
        onLeftWidthChange={handleListWidth}
      />
    </div>
  );
}

// ─── Reading pane ────────────────────────────────────────────────────────────

interface ReadingPaneProps {
  email: EmailSummary;
  position: { index: number; total: number } | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  detailTab: "summary" | "email";
  onTabChange: (tab: "summary" | "email") => void;
  onResync: () => void;
  isResyncing: boolean;
  isLoadingDetail: boolean;
  onStatusChange: (status: EmailStatus) => void;
  onTagsChange: (tags: string[]) => void;
  availableTags: string[];
}

// Above this pane width there's room to lay the AI insights and the original
// email out as two columns instead of one-at-a-time behind tabs — that fills
// the empty right side of a wide reading pane and shows both at once.
const READER_TWO_COL_WIDTH = 940;

function ReadingPane({
  email, position, onPrev, onNext, onClose, detailTab, onTabChange,
  onResync, isResyncing, isLoadingDetail, onStatusChange, onTagsChange, availableTags,
}: ReadingPaneProps) {
  const sender = parseSender(email.from);
  const hasAttachments = (email.attachments?.length ?? 0) > 0;
  const [paneRef, paneWidth] = useElementWidth<HTMLDivElement>();
  const twoColumn = paneWidth >= READER_TWO_COL_WIDTH;

  // The two tab bodies, built once and placed either behind tabs (narrow) or
  // side by side (wide) so neither layout duplicates the markup.
  const insightsBlock = email.summarized === false ? (
    isLoadingDetail ? (
      <DetailLoadingSkeleton message="Generating AI summary… emails are summarized the first time you open them." />
    ) : (
      <div className="text-center py-12 text-gray-400">
        <p className="text-sm">No AI summary yet.</p>
        <p className="text-xs text-gray-300 mt-1">Use “Refresh Summary” above to generate one.</p>
      </div>
    )
  ) : (
    <EmailInsightsPanel email={email} />
  );

  const emailBlock = (
    <>
      <div className="flex-1 min-h-0 flex flex-col pane-padx pt-3 pb-3">
        {(email.htmlBody || email.body) ? (
          email.htmlBody ? (
            <div className="flex-1 min-h-0 rounded-xl border border-gray-200 overflow-hidden">
              <iframe
                srcDoc={email.htmlBody}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="w-full h-full bg-white block"
                style={{ border: "none" }}
                title="Email content"
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 bg-gray-50 rounded-xl p-4 border border-gray-200 overflow-y-auto">
              <LinkifiedText
                text={email.body ?? ""}
                className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words"
              />
            </div>
          )
        ) : isLoadingDetail ? (
          <DetailLoadingSkeleton message="Loading email content…" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No email body available</p>
          </div>
        )}
      </div>

      {hasAttachments && (
        <div className="flex-shrink-0 max-h-[38%] overflow-y-auto border-t border-gray-100 pane-padx py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Attachments ({email.attachments!.length})
          </p>
          <div className="space-y-2.5">
            {email.attachments!.map((att, i) => (
              <PdfViewer key={i} attachment={att} />
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div ref={paneRef} className="flex-1 flex flex-col overflow-hidden bg-white animate-panel-in min-h-0">
      {/* Toolbar — close, position, prev/next, actions. All the chrome that
          isn't the email itself lives on this one 36px row. */}
      <div className="flex items-center gap-1.5 pane-padx py-1.5 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={onClose}
          aria-label="Close email (Esc)"
          title="Close and give the list the full width (Esc)"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="w-px h-4 bg-gray-200" />

        <button
          onClick={onPrev}
          disabled={!position || position.index <= 0}
          aria-label="Previous email (K)"
          title="Previous email (K)"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={onNext}
          disabled={!position || position.index >= position.total - 1}
          aria-label="Next email (J)"
          title="Next email (J)"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {position && (
          <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
            {position.index + 1} of {position.total}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={onResync}
          disabled={isResyncing}
          title="Generate a fresh AI summary for this email — use this if the summary looks off"
          className="flex items-center gap-1.5 h-7 px-2 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
        >
          {isResyncing
            ? <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
          }
          <span className="hidden lg:inline">Refresh Summary</span>
        </button>

        <select
          value={email.status}
          onChange={(e) => onStatusChange(e.target.value as EmailStatus)}
          aria-label="Email status"
          title="New = unread, Open = you're working on it, Closed = done"
          className={`h-7 text-[11px] font-semibold rounded-lg px-1.5 border-0 ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer ${STATUS_STYLE[email.status]}`}
        >
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Header — subject, sender, badges and tags packed into one block
          instead of four stacked sections. */}
      <div className="pane-padx py-2.5 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-[15px] font-bold text-gray-900 leading-snug mb-2">
          {email.subject || "(No Subject)"}
        </h2>
        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 ${avatarColor(email.from)}`}>
            {sender.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              {/* The address truncates rather than running past the pane edge —
                  the pane is resizable and can get quite narrow. */}
              <span className="min-w-0 flex-1 flex items-baseline gap-1.5 overflow-hidden">
                <span className="text-[13px] font-semibold text-gray-900 flex-shrink-0">{sender.name}</span>
                {sender.email && <span className="text-[11px] text-gray-400 truncate">&lt;{sender.email}&gt;</span>}
              </span>
              <span className="text-[11px] text-gray-400 flex-shrink-0">{formatFull(email.date)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {/* AI-derived badges are hidden until the email is summarized —
                  otherwise a pending email would flash placeholder values. */}
              {email.summarized !== false && (
                <>
                  <span title="What kind of email this is, decided by AI" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset ${CATEGORY_BADGE[email.category] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                    {email.category}
                  </span>
                  <span title="How urgent this email is" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset ${PRIORITY_BADGE[email.priority]}`}>
                    {email.priority}
                  </span>
                  <span title="The overall tone of this email" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset capitalize ${SENTIMENT_STYLE[email.sentiment]}`}>
                    {email.sentiment}
                  </span>
                </>
              )}
              {email.actionRequired === "Yes" && (
                <span title="This email needs a reply or task from you" className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset bg-red-50 text-red-600 ring-red-200">
                  Action Required
                </span>
              )}
              {hasAttachments && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset bg-gray-100 text-gray-600 ring-gray-200">
                  📎 {email.attachments!.length} PDF
                </span>
              )}
              <span className="w-px h-3.5 bg-gray-200 mx-0.5" />
              <div className="flex-1 min-w-[130px]">
                <TagInput
                  variant="inline"
                  value={email.tags}
                  onChange={onTagsChange}
                  placeholder="Add a tag…"
                  suggestions={availableTags}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content. Wide enough → insights and the original email sit side by
          side, filling the pane instead of leaving the right half blank. Too
          narrow for two readable columns → fall back to the tabbed layout. */}
      {twoColumn ? (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <section className="w-[46%] max-w-[600px] min-w-[360px] flex flex-col min-h-0 border-r border-gray-200">
            <p className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 pane-padx py-1.5 border-b border-gray-100">AI Insights</p>
            <div className="flex-1 overflow-y-auto pane-padx py-4">{insightsBlock}</div>
          </section>
          <section className="flex-1 flex flex-col min-h-0">
            <p className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 pane-padx py-1.5 border-b border-gray-100">Original Email</p>
            {emailBlock}
          </section>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 border-b border-gray-200 pane-padx flex-shrink-0">
            {(["summary", "email"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors
                  ${detailTab === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                {tab === "summary" ? "AI Insights" : "Original Email"}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {detailTab === "summary" && <div className="flex-1 overflow-y-auto pane-padx py-4">{insightsBlock}</div>}
            {detailTab === "email" && emailBlock}
          </div>
        </>
      )}
    </div>
  );
}
