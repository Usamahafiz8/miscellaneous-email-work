"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { EmailSummary, EmailStatus, Stage, HiringCriteria, CandidateEvaluation } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { formatRelative, formatFull, parseSender, avatarGradient } from "@/lib/utils";
import { useDashboard } from "./DashboardProvider";
import DataTable from "./DataTable";
import PdfViewer from "./PdfViewer";
import EmailInsightsPanel from "./EmailInsightsPanel";
import LinkifiedText from "./LinkifiedText";
import TagInput from "./TagInput";

interface EvalState {
  loading: boolean;
  result: CandidateEvaluation | null;
  error: string | null;
}

const FILTER_PILLS: { value: "" | "unevaluated" | "high" | "medium" | "low"; label: string }[] = [
  { value: "", label: "All" },
  { value: "unevaluated", label: "Needs review" },
  { value: "high", label: "Strong match" },
  { value: "medium", label: "Possible match" },
  { value: "low", label: "Weak match" },
];

type Candidate = { email: EmailSummary; mand: number; opt: number; eval: CandidateEvaluation | null };

// ─── Score ring ──────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-black" style={{ color }}>{score}%</span>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function HiringView() {
  const router = useRouter();
  const pathname = usePathname();
  // Derived directly from the URL rather than passed down from page.tsx params —
  // this component now lives in a layout (see app/hiring/layout.tsx), which Next.js
  // keeps mounted across /hiring <-> /hiring/[emailId] navigations, so all local
  // state (filters, page, search, evaluations) survives opening/closing a candidate
  // instead of resetting and refetching on every click.
  const selectedId = pathname.startsWith("/hiring/") ? decodeURIComponent(pathname.slice("/hiring/".length)) : undefined;
  const searchParams = useSearchParams();
  const activeStage = searchParams.get("stage");
  const {
    syncEmails, isSyncing, syncVersion,
    loadingDetailId, loadEmailDetail, getEmailDetail, patchEmail, availableTags,
  } = useDashboard();

  const [criteria] = useState<HiringCriteria>({ position: "", mandatory: [], optional: [] });
  const [evaluations, setEvaluations] = useState<Map<string, EvalState>>(new Map());
  const [isEvaluatingAll, setIsEvaluatingAll] = useState(false);
  const [detailTab, setDetailTab] = useState<"insights" | "email">("insights");

  // Candidate filters — search hits the server (correct across the whole mailbox);
  // the status/match pill only ever reflects THIS session's evaluations (they're
  // not persisted to the DB), so it necessarily filters the current page only.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [candidateFilter, setCandidateFilter] = useState<"" | "unevaluated" | "high" | "medium" | "low">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [debouncedSearch, activeStage]);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.append("category", "Hiring");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (activeStage) params.append("stage", activeStage);
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
  }, [page, pageSize, debouncedSearch, activeStage]);

  useEffect(() => {
    fetchPage();
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, syncVersion]);

  // Auto-open the first candidate once, so the split view shows list + detail
  // together without requiring an initial click. Only fires once per session.
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (selectedId) { hasAutoSelectedRef.current = true; return; }
    if (rows.length === 0) return;
    hasAutoSelectedRef.current = true;
    router.push(`/hiring/${encodeURIComponent(rows[0].emailId)}`);
  }, [rows, selectedId, router]);

  const hasFilters = !!(searchInput.trim() || candidateFilter);
  // Evaluations live only in this session's state (not the DB), so whether a
  // candidate's been scored has nothing to do with which page is loaded.
  const hasEvaluations = useMemo(() => Array.from(evaluations.values()).some((e) => e.result), [evaluations]);
  const hasCriteria = !!(criteria.position.trim() && criteria.mandatory.length > 0);

  const visibleCandidates = useMemo<Candidate[]>(() => {
    const getText = (e: EmailSummary) => [e.summary, e.subject, e.from, ...e.keyPoints].join(" ").toLowerCase();
    const mandHits = (e: EmailSummary) => (hasCriteria ? criteria.mandatory.filter((r) => getText(e).includes(r.toLowerCase())).length : 0);
    const optHits = (e: EmailSummary) => (hasCriteria ? criteria.optional.filter((r) => getText(e).includes(r.toLowerCase())).length : 0);

    let scored: Candidate[] = rows.map((e) => ({
      email: e,
      mand: mandHits(e),
      opt: optHits(e),
      eval: evaluations.get(e.emailId)?.result ?? null,
    }));

    if (candidateFilter === "unevaluated") scored = scored.filter((c) => c.eval === null);
    if (candidateFilter === "high") scored = scored.filter((c) => c.eval && c.eval.matchScore >= 70);
    if (candidateFilter === "medium") scored = scored.filter((c) => c.eval && c.eval.matchScore >= 40 && c.eval.matchScore < 70);
    if (candidateFilter === "low") scored = scored.filter((c) => c.eval && c.eval.matchScore < 40);

    scored.sort((a, b) => {
      if (a.eval && b.eval) return b.eval.matchScore - a.eval.matchScore;
      if (a.eval) return -1;
      if (b.eval) return 1;
      const relA = a.mand * 10 + a.opt;
      const relB = b.mand * 10 + b.opt;
      if (relA !== relB) return relB - relA;
      return new Date(b.email.date).getTime() - new Date(a.email.date).getTime();
    });

    return scored;
  }, [rows, evaluations, criteria, hasCriteria, candidateFilter]);

  const selectedEmail = useMemo(() => {
    if (!selectedId) return null;
    return getEmailDetail(selectedId) ?? rows.find((r) => r.emailId === selectedId) ?? null;
  }, [selectedId, getEmailDetail, rows]);

  useEffect(() => {
    if (!selectedId) return;
    setDetailTab("insights");
    loadEmailDetail(selectedId);
  }, [selectedId, loadEmailDetail]);

  function handleSelect(email: EmailSummary) {
    router.push(selectedId === email.emailId ? "/hiring" : `/hiring/${encodeURIComponent(email.emailId)}`);
  }

  async function evaluate(email: EmailSummary) {
    if (!hasCriteria) return;
    setEvaluations((prev) => new Map(prev).set(email.emailId, { loading: true, result: null, error: null }));
    try {
      const res = await fetch("/api/hiring/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: email.summary, keyPoints: email.keyPoints, subject: email.subject, criteria }),
      });
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Evaluation failed");
      setEvaluations((prev) => new Map(prev).set(email.emailId, { loading: false, result: data.evaluation, error: null }));
    } catch (err) {
      setEvaluations((prev) => new Map(prev).set(email.emailId, {
        loading: false, result: null,
        error: err instanceof Error ? err.message : "Failed",
      }));
    }
  }

  async function evaluateAll() {
    if (!hasCriteria || rows.length === 0) return;
    setIsEvaluatingAll(true);
    // Run sequentially to avoid hammering the API
    for (const email of rows) {
      const existing = evaluations.get(email.emailId);
      if (existing?.result) continue;
      await evaluate(email);
    }
    setIsEvaluatingAll(false);
  }

  async function bulkEvaluate(ids: string[]) {
    if (!hasCriteria) return;
    for (const id of ids) {
      const email = rows.find((r) => r.emailId === id);
      if (!email) continue;
      const existing = evaluations.get(id);
      if (existing?.result) continue;
      await evaluate(email);
    }
  }

  async function bulkMarkStatus(ids: string[], newStatus: EmailStatus) {
    setRows((prev) => prev.map((r) => (ids.includes(r.emailId) ? { ...r, status: newStatus } : r)));
    await Promise.all(ids.map((id) => patchEmail(id, { status: newStatus })));
    fetchPage();
  }

  function handleTagsChange(emailId: string, tags: string[]) {
    setRows((prev) => prev.map((r) => (r.emailId === emailId ? { ...r, tags } : r)));
    patchEmail(emailId, { tags });
  }

  function handleStageChange(emailId: string, stage: Stage) {
    setRows((prev) => prev.map((r) => (r.emailId === emailId ? { ...r, stage } : r)));
    patchEmail(emailId, { stage });
  }

  async function bulkMoveStage(ids: string[], stage: Stage) {
    setRows((prev) => prev.map((r) => (ids.includes(r.emailId) ? { ...r, stage } : r)));
    await Promise.all(ids.map((id) => patchEmail(id, { stage })));
    fetchPage();
  }

  function clearFilters() {
    setSearchInput("");
    setCandidateFilter("");
  }

  // Gmail-style single-line candidate row: avatar, name, "subject — snippet",
  // match score (once evaluated) or a hover-reveal Evaluate action, date.
  function renderCandidateRow(c: Candidate) {
    const sender = parseSender(c.email.from);
    const evalState = evaluations.get(c.email.emailId) ?? null;
    const isEvaluating = evalState?.loading ?? false;
    return (
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarGradient(c.email.from)} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
          {sender.initials}
        </div>
        <span className="w-[160px] flex-shrink-0 truncate text-xs font-medium text-gray-900">{sender.name}</span>
        <span className="flex-1 min-w-0 truncate text-xs">
          <span className="text-gray-700 font-medium">{c.email.subject || "(No Subject)"}</span>
          <span className="text-gray-400"> — {c.email.summary}</span>
        </span>
        {c.email.tags.length > 0 && (
          <span className="flex items-center gap-1 flex-shrink-0">
            {c.email.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 whitespace-nowrap">{tag}</span>
            ))}
            {c.email.tags.length > 2 && <span className="text-[10px] text-gray-400">+{c.email.tags.length - 2}</span>}
          </span>
        )}
        {hasCriteria && !c.eval && (c.mand > 0 || c.opt > 0) && (
          <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 whitespace-nowrap">
            {c.mand}/{criteria.mandatory.length} req
          </span>
        )}
        {c.eval && (
          <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap
            ${c.eval.matchScore >= 70 ? "bg-emerald-100 text-emerald-700" : c.eval.matchScore >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
            {c.eval.matchScore}%
          </span>
        )}
        {evalState?.error && <span className="flex-shrink-0 text-[10px] text-red-400 whitespace-nowrap">Error</span>}
        {(c.email.attachments?.length ?? 0) > 0 && (
          <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Has attachment">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        )}
        {isEvaluating ? (
          <div className="flex-shrink-0 w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        ) : hasCriteria && !c.eval ? (
          <button
            onClick={(e) => { e.stopPropagation(); evaluate(c.email); }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[10px] font-semibold px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 ring-1 ring-violet-200 transition-opacity whitespace-nowrap"
          >
            Evaluate
          </button>
        ) : null}
        <span className="w-14 flex-shrink-0 text-right text-xs text-gray-400 whitespace-nowrap">{formatRelative(c.email.date)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            Hiring
            {activeStage && <span className="text-violet-600"> · {activeStage}</span>}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {total} candidate{total !== 1 ? "s" : ""}
            {hasCriteria ? ` · ${criteria.position}` : ""}
            {activeStage && (
              <button onClick={() => router.push("/hiring")} className="ml-2 text-violet-600 hover:text-violet-700 font-medium">
                Clear stage filter ×
              </button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasCriteria && rows.length > 0 && (
            <button
              onClick={evaluateAll}
              disabled={isEvaluatingAll || isLoading}
              title="Run AI evaluation for all candidates on this page against the job criteria"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-100 hover:bg-violet-200 disabled:opacity-50 text-violet-700 text-sm font-medium transition-colors"
            >
              {isEvaluatingAll
                ? <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              }
              <span className="hidden sm:inline">{isEvaluatingAll ? "Evaluating…" : "Evaluate Page"}</span>
            </button>
          )}
          <button onClick={syncEmails} disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {isSyncing
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── Candidate search & filters ──────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50/50 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          {searchInput.trim() !== "" && (searchInput !== debouncedSearch || isLoading) ? (
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
          )}
          <input
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Search candidates…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors"
          />
        </div>

        {searchInput.trim() !== "" && (searchInput !== debouncedSearch || isLoading) && (
          <span className="text-xs text-violet-500 font-medium animate-pulse">Searching…</span>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_PILLS.filter(p => p.value === "" || p.value === "unevaluated" || hasEvaluations).map(p => (
            <button
              key={p.value || "all"}
              onClick={() => setCandidateFilter(p.value)}
              className={`text-xs font-medium px-3 py-2 rounded-full border whitespace-nowrap transition-colors
                ${candidateFilter === p.value
                  ? "bg-violet-600 border-violet-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-700"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-violet-600 font-medium hover:text-violet-800 px-2.5 py-2 rounded-lg border border-violet-200 bg-violet-50 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400 hidden sm:block">
          {visibleCandidates.length}{hasFilters ? ` of ${rows.length} on page` : ""} candidate{rows.length !== 1 ? "s" : ""}
        </span>
      </div>


      {/* ── Split view: narrower list column when a candidate is open ──────── */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex flex-col overflow-hidden ${selectedEmail ? "w-[420px] flex-shrink-0 border-r border-gray-200" : "flex-1"}`}>
          <DataTable
            variant="list"
            renderRow={renderCandidateRow}
            rows={visibleCandidates}
            rowKey={(c) => c.email.emailId}
            onRowClick={(c) => handleSelect(c.email)}
            isRowSelected={(c) => selectedId === c.email.emailId}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            bulkActions={[
              ...(hasCriteria ? [{ label: "Evaluate Selected", onRun: bulkEvaluate }] : []),
              { label: "Shortlist", onRun: (ids: string[]) => bulkMoveStage(ids, "Shortlisted") },
              { label: "Reject", onRun: (ids: string[]) => bulkMoveStage(ids, "Rejected"), variant: "danger" as const },
              { label: "Mark as Open", onRun: (ids: string[]) => bulkMarkStatus(ids, "Open") },
              { label: "Mark as Closed", onRun: (ids: string[]) => bulkMarkStatus(ids, "Closed") },
            ]}
            pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
            isLoading={isLoading || isSyncing}
            emptyState={
              <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
                <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">{hasFilters ? "No candidates match the current filters" : "No hiring emails found"}</p>
                {hasFilters ? (
                  <button onClick={clearFilters} className="text-sm font-medium text-violet-600 hover:text-violet-700">Clear filters →</button>
                ) : (
                  <button onClick={syncEmails} className="text-sm font-medium text-violet-600 hover:text-violet-700">Sync inbox →</button>
                )}
              </div>
            }
          />
        </div>

        {/* ── Reading pane (Gmail-style split, not an overlay) ─────────── */}
        {selectedEmail && (
          <DetailPanel
            email={selectedEmail}
            evalState={evaluations.get(selectedEmail.emailId) ?? null}
            detailTab={detailTab}
            onTabChange={setDetailTab}
            onClose={() => router.push("/hiring")}
            onEvaluate={() => evaluate(selectedEmail)}
            hasCriteria={hasCriteria}
            isLoadingDetail={loadingDetailId === selectedEmail.emailId}
            onTagsChange={(tags) => handleTagsChange(selectedEmail.emailId, tags)}
            availableTags={availableTags}
            onStageChange={(stage) => handleStageChange(selectedEmail.emailId, stage)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Detail panel (slide-over) ──────────────────────────────────────────────

interface DetailPanelProps {
  email: EmailSummary;
  evalState: EvalState | null;
  detailTab: "insights" | "email";
  onTabChange: (tab: "insights" | "email") => void;
  onClose: () => void;
  onEvaluate: () => void;
  hasCriteria: boolean;
  isLoadingDetail: boolean;
  onTagsChange: (tags: string[]) => void;
  availableTags: string[];
  onStageChange: (stage: Stage) => void;
}

function DetailPanel({ email, evalState, detailTab, onTabChange, onClose, onEvaluate, hasCriteria, isLoadingDetail, onTagsChange, availableTags, onStageChange }: DetailPanelProps) {
  const sender = parseSender(email.from);
  const evaluated = evalState?.result ?? null;
  const candidateName = (evaluated?.candidateName && evaluated.candidateName !== "Unknown Candidate")
    ? evaluated.candidateName : sender.name;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1" />
        <select
          value={email.stage}
          onChange={(e) => onStageChange(e.target.value as Stage)}
          className="text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 text-gray-600"
        >
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {!evalState ? (
          <button onClick={onEvaluate} disabled={!hasCriteria}
            title={hasCriteria ? "Evaluate against job criteria" : "Set job criteria first"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Evaluate Candidate
          </button>
        ) : evalState.loading ? (
          <div className="flex items-center gap-1.5 text-violet-600 text-xs">
            <div className="w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            Evaluating…
          </div>
        ) : evalState.error ? (
          <span className="text-xs text-red-500">{evalState.error}</span>
        ) : evaluated ? (
          <button onClick={onEvaluate} className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">Re-evaluate</button>
        ) : null}
      </div>

      {/* Candidate header */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${avatarGradient(email.from)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm`}>
            {sender.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">{candidateName}</h2>
                {sender.email && <p className="text-xs text-gray-400 mt-0.5">{sender.email}</p>}
                <p className="text-xs font-medium text-violet-500 mt-1 truncate">{email.subject || "(No Subject)"}</p>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{formatFull(email.date)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset
                ${email.priority === "Critical" ? "bg-red-50 text-red-600 ring-red-200"
                  : email.priority === "High" ? "bg-orange-50 text-orange-600 ring-orange-200"
                  : email.priority === "Medium" ? "bg-yellow-50 text-yellow-700 ring-yellow-200"
                  : "bg-green-50 text-green-700 ring-green-200"}`}>
                {email.priority}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset capitalize
                ${email.sentiment === "positive" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : email.sentiment === "negative" ? "bg-red-50 text-red-600 ring-red-200"
                  : "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                {email.sentiment}
              </span>
              {email.actionRequired === "Yes" && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset bg-red-50 text-red-600 ring-red-200">Action Required</span>
              )}
              {(email.attachments?.length ?? 0) > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset bg-gray-100 text-gray-600 ring-gray-200">
                  {email.attachments!.length} PDF attachment{email.attachments!.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Tags</p>
              <TagInput value={email.tags} onChange={onTagsChange} placeholder="Add a tag…" suggestions={availableTags} />
            </div>
          </div>
        </div>

        {/* Evaluation result */}
        {evaluated && (
          <div className={`mt-4 rounded-xl p-4 flex items-center gap-4 ${evaluated.recommendation === "Yes" ? "bg-emerald-50 border border-emerald-100" : "bg-red-50 border border-red-100"}`}>
            <ScoreRing score={evaluated.matchScore} />
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full mb-1.5
                ${evaluated.recommendation === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                {evaluated.recommendation === "Yes" ? "✓ Recommended" : "✗ Not Recommended"}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">{evaluated.reasoning}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-5 bg-white flex-shrink-0">
        {(["insights", "email"] as const).map(tab => (
          <button key={tab} onClick={() => onTabChange(tab)}
            className={`mr-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors
              ${detailTab === tab ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {tab === "insights" ? "AI Insights" : "Email"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-5 space-y-4">
          {detailTab === "insights" && <EmailInsightsPanel email={email} />}

          {detailTab === "email" && (
            <>
              {(email.htmlBody || email.body) ? (
                email.htmlBody ? (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <iframe srcDoc={email.htmlBody} sandbox="allow-popups allow-popups-to-escape-sandbox"
                      className="w-full bg-white" style={{ height: "480px", border: "none" }} title="Email content" />
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 max-h-96 overflow-y-auto">
                    <LinkifiedText
                      text={email.body ?? ""}
                      className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words"
                    />
                  </div>
                )
              ) : isLoadingDetail ? (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-6 h-6 mx-auto mb-2 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
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

              {(email.attachments?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Attachments ({email.attachments!.length})
                  </p>
                  <div className="space-y-3">
                    {email.attachments!.map((att, i) => (
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
  );
}
