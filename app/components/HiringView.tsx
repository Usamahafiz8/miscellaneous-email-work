"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { EmailSummary, EmailStatus, Stage, HiringCriteria, CandidateEvaluation } from "@/lib/types";
import { STAGES, STATUSES } from "@/lib/types";
import { formatRelative, formatFull, parseSender, avatarGradient, isPresent, orDash } from "@/lib/utils";
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

interface EvalState {
  loading: boolean;
  result: CandidateEvaluation | null;
  error: string | null;
}

type MatchFilter = "" | "unevaluated" | "high" | "medium" | "low";

const MATCH_OPTIONS: { value: MatchFilter; label: string }[] = [
  { value: "", label: "Match: any" },
  { value: "unevaluated", label: "Needs review" },
  { value: "high", label: "Strong match" },
  { value: "medium", label: "Possible match" },
  { value: "low", label: "Weak match" },
];

type Candidate = { email: EmailSummary; mand: number; opt: number; eval: CandidateEvaluation | null };

const STAGE_BADGE: Record<Stage, string> = {
  New: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Shortlisted: "bg-violet-50 text-violet-700 ring-violet-200",
  Interviewing: "bg-amber-50 text-amber-700 ring-amber-200",
  Offer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-red-50 text-red-600 ring-red-200",
  Hired: "bg-green-50 text-green-700 ring-green-200",
};

interface HiringFilterBag {
  search: string;
  stageFilter: string[];
  tagFilter: string[];
  statusFilter: string[];
  dateFrom?: string;
  dateTo?: string;
  skillFilter: string[];
  keywords: string;
}

type ListTier = "narrow" | "medium" | "full";

function scoreColor(score: number): string {
  return score >= 70 ? "bg-emerald-100 text-emerald-700" : score >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
}

// ─── Score ring ──────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-black" style={{ color }}>{score}%</span>
      </div>
    </div>
  );
}

// ─── Job criteria popover ────────────────────────────────────────────────────
// This used to be a permanently-mounted panel between the filter bar and the
// candidate list — three input fields' worth of height on every page load, for
// something you set once. As a popover it costs one 32px button instead.

function CriteriaPopover({
  criteria, onChange, hasCriteria, compact,
}: {
  criteria: HiringCriteria;
  onChange: (next: HiringCriteria) => void;
  hasCriteria: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={hasCriteria
          ? `Evaluating against: ${criteria.position} · ${criteria.mandatory.length} required skill${criteria.mandatory.length === 1 ? "" : "s"}`
          : "Set a position and required skills to unlock AI candidate scoring"}
        className={`flex items-center gap-1.5 h-8 rounded-lg border text-[13px] transition-colors whitespace-nowrap
          ${compact ? "w-8 justify-center" : "px-2"}
          ${hasCriteria
            ? "border-violet-300 bg-violet-50 text-violet-700 font-medium"
            : "border-dashed border-gray-300 bg-white text-gray-500 hover:border-violet-300 hover:text-violet-700"}`}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        {!compact && (
          <>
            <span className="max-w-[150px] truncate">{hasCriteria ? criteria.position : "Job Criteria"}</span>
            {hasCriteria && (
              <span className="text-[10px] font-bold px-1 rounded-full bg-violet-600 text-white">{criteria.mandatory.length}</span>
            )}
            <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-[340px] bg-white rounded-xl border border-gray-200 shadow-xl z-30 p-3.5 space-y-3 animate-dropdown-in">
          <p className="text-[11px] text-gray-500 leading-snug">
            Describe the role you&rsquo;re hiring for. AI scores every candidate against it — a position and at
            least one required skill are needed before evaluation is enabled.
          </p>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Position <span className="text-gray-400 font-normal normal-case">(required)</span>
            </label>
            <input
              value={criteria.position}
              onChange={(e) => onChange({ ...criteria, position: e.target.value })}
              placeholder="e.g. Senior React Developer"
              className="w-full text-[13px] rounded-lg border border-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Must Have <span className="text-gray-400 font-normal normal-case">(type one, press Enter)</span>
            </label>
            <TagInput value={criteria.mandatory} onChange={(v) => onChange({ ...criteria, mandatory: v })} placeholder="e.g. React, 5+ yrs" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Nice to Have <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </label>
            <TagInput value={criteria.optional} onChange={(v) => onChange({ ...criteria, optional: v })} placeholder="e.g. TypeScript" />
          </div>
        </div>
      )}
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
  const {
    counts, syncEmails, isSyncing, syncVersion,
    loadingDetailId, loadEmailDetail, getEmailDetail, patchEmail, availableTags, availableSkills,
  } = useDashboard();

  const [criteria, setCriteria] = useState<HiringCriteria>({ position: "", mandatory: [], optional: [] });
  const [evaluations, setEvaluations] = useState<Map<string, EvalState>>(new Map());
  const [isEvaluatingAll, setIsEvaluatingAll] = useState(false);
  const [detailTab, setDetailTab] = useState<"insights" | "email">("insights");

  // Candidate filters — search hits the server (correct across the whole mailbox);
  // the status/match pill only ever reflects THIS session's evaluations (they're
  // not persisted to the DB), so it necessarily filters the current page only.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [debouncedKeywords, setDebouncedKeywords] = useState("");
  const [candidateFilter, setCandidateFilter] = useState<MatchFilter>("");
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [skillFilter, setSkillFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<DataTableSort>({ field: "date", order: "desc" });

  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [listTier, setListTier] = useState<ListTier>("full");
  const handleListWidth = useCallback((w: number) => {
    setListTier(w >= 900 ? "full" : w >= 580 ? "medium" : "narrow");
  }, []);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeywords(keywordsInput), 300);
    return () => clearTimeout(t);
  }, [keywordsInput]);

  useEffect(() => { setPage(1); }, [debouncedSearch, stageFilter, tagFilter, statusFilter, dateFrom, dateTo, sort, skillFilter, debouncedKeywords]);

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
    params.append("category", "Hiring");
    if (debouncedSearch) params.set("search", debouncedSearch);
    stageFilter.forEach((s) => params.append("stage", s));
    tagFilter.forEach((t) => params.append("tag", t));
    statusFilter.forEach((s) => params.append("status", s));
    skillFilter.forEach((s) => params.append("skill", s));
    if (debouncedKeywords) params.set("keywords", debouncedKeywords);
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
  }, [page, pageSize, debouncedSearch, stageFilter, tagFilter, statusFilter, dateFrom, dateTo, sort, skillFilter, debouncedKeywords]);

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

  const hasFilters = !!(searchInput.trim() || candidateFilter || stageFilter.length || tagFilter.length || statusFilter.length || dateFrom || dateTo || skillFilter.length || debouncedKeywords);
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

  // ── Candidate-to-candidate navigation (j / k and the pane's ↑↓ buttons) ──
  const currentIndex = useMemo(
    () => (selectedId ? visibleCandidates.findIndex((c) => c.email.emailId === selectedId) : -1),
    [visibleCandidates, selectedId]
  );

  const goRelative = useCallback((delta: number) => {
    if (visibleCandidates.length === 0) return;
    const next = currentIndex === -1 ? 0 : currentIndex + delta;
    if (next < 0 || next >= visibleCandidates.length) return;
    router.push(`/hiring/${encodeURIComponent(visibleCandidates[next].email.emailId)}`);
  }, [visibleCandidates, currentIndex, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      // `j` is also the tail of "g j" (→ Jobs); let that win.
      if (isGSequenceKey()) return;

      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "Escape" && selectedId) { e.preventDefault(); router.push("/hiring"); return; }

      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); goRelative(1); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); goRelative(-1); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goRelative, selectedId, router]);

  // useCallback (not a plain function) because it's read inside the memoized
  // column definitions below — needs a stable identity keyed to its real deps
  // so that memo only recomputes when criteria/hasCriteria actually change.
  const evaluate = useCallback(async (email: EmailSummary) => {
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
  }, [hasCriteria, criteria]);

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

  // useCallback for the same reason as `evaluate` above — read inside the
  // memoized column definitions.
  const handleStageChange = useCallback((emailId: string, stage: Stage) => {
    setRows((prev) => prev.map((r) => (r.emailId === emailId ? { ...r, stage } : r)));
    patchEmail(emailId, { stage });
  }, [patchEmail]);

  async function bulkMoveStage(ids: string[], stage: Stage) {
    setRows((prev) => prev.map((r) => (ids.includes(r.emailId) ? { ...r, stage } : r)));
    await Promise.all(ids.map((id) => patchEmail(id, { stage })));
    fetchPage();
  }

  function clearFilters() {
    setSearchInput("");
    setCandidateFilter("");
    setStageFilter([]);
    setTagFilter([]);
    setStatusFilter([]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setSkillFilter([]);
    setKeywordsInput("");
  }

  // Deliberately excludes candidateFilter/job-criteria state — those are
  // session-only evaluation state, not list filters worth saving as a preset.
  const currentFilterBag: HiringFilterBag = { search: searchInput, stageFilter, tagFilter, statusFilter, dateFrom, dateTo, skillFilter, keywords: keywordsInput };
  function applyFilterPreset(f: HiringFilterBag) {
    setSearchInput(f.search);
    setStageFilter(f.stageFilter);
    setTagFilter(f.tagFilter);
    setStatusFilter(f.statusFilter);
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
    setSkillFilter(f.skillFilter);
    setKeywordsInput(f.keywords);
  }

  // Tabular (spreadsheet) candidate grid: full column set when the list has the
  // whole width to itself, a trimmed set once the split view opens.
  const FULL_HIRING_COLUMNS: ColumnDef<Candidate>[] = useMemo(() => [
    {
      key: "date", header: "Date", sortable: true, width: "88px",
      render: (c) => <span className="text-gray-400 whitespace-nowrap">{formatRelative(c.email.date)}</span>,
    },
    {
      key: "candidateName", header: "Candidate", sortable: true, width: "160px",
      render: (c) => (
        <span className="truncate block font-medium text-gray-900">
          {isPresent(c.email.candidateName) ? c.email.candidateName : parseSender(c.email.from).name}
        </span>
      ),
    },
    {
      key: "candidateExperience", header: "Experience", sortable: true, width: "110px",
      render: (c) => <span className="truncate block text-gray-700">{orDash(c.email.candidateExperience)}</span>,
    },
    {
      key: "subject", header: "Position", sortable: true,
      render: (c) => <span className="truncate block text-gray-700">{c.email.subject || "(No Subject)"}</span>,
    },
    {
      key: "summary", header: "AI Summary", width: "280px",
      render: (c) => <span className="block text-gray-600 whitespace-normal break-words leading-relaxed line-clamp-2">{c.email.summary}</span>,
    },
    {
      key: "matchScore", header: "Match", width: "84px", align: "right",
      headerHint: "How well this candidate fits the job criteria set in the toolbar — click Evaluate to score",
      render: (c) => {
        const evalState = evaluations.get(c.email.emailId) ?? null;
        if (evalState?.loading) return <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin inline-block" />;
        if (c.eval) {
          return <span className={`font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${scoreColor(c.eval.matchScore)}`}>{c.eval.matchScore}%</span>;
        }
        if (hasCriteria) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); evaluate(c.email); }}
              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 ring-1 ring-violet-200 transition-colors whitespace-nowrap"
            >
              Evaluate
            </button>
          );
        }
        return <span className="text-gray-300">—</span>;
      },
    },
    {
      key: "recommendation", header: "Recommend", width: "98px",
      headerHint: "AI's yes/no hiring recommendation based on the job criteria",
      render: (c) => c.eval
        ? <span className={`font-semibold whitespace-nowrap ${c.eval.recommendation === "Yes" ? "text-emerald-600" : "text-red-500"}`}>{c.eval.recommendation}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      key: "stage", header: "Stage", sortable: true, width: "126px",
      headerHint: "Where this candidate is in your hiring process — click to move them",
      render: (c) => (
        <select
          value={c.email.stage}
          onChange={(e) => handleStageChange(c.email.emailId, e.target.value as Stage)}
          onClick={(e) => e.stopPropagation()}
          title="Where this candidate is in your hiring process"
          className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ring-1 ring-inset border-none outline-none cursor-pointer ${STAGE_BADGE[c.email.stage]}`}
        >
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      ),
    },
    {
      key: "tags", header: "Tags", width: "150px",
      render: (c) => c.email.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {c.email.tags.map((t) => (
            <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 whitespace-nowrap">{t}</span>
          ))}
        </div>
      ) : <span className="text-gray-300">—</span>,
    },
  ], [evaluations, hasCriteria, evaluate, handleStageChange]);

  const MEDIUM_HIRING_COLUMNS: ColumnDef<Candidate>[] = useMemo(() => [
    {
      key: "candidateName", header: "Candidate", sortable: true, width: "150px",
      render: (c) => (
        <span className="truncate block font-medium text-gray-900">
          {isPresent(c.email.candidateName) ? c.email.candidateName : parseSender(c.email.from).name}
        </span>
      ),
    },
    {
      key: "subject", header: "Position", sortable: true,
      render: (c) => <span className="truncate block text-gray-700">{c.email.subject || "(No Subject)"}</span>,
    },
    {
      key: "stage", header: "Stage", sortable: true, width: "120px",
      render: (c) => (
        <select
          value={c.email.stage}
          onChange={(e) => handleStageChange(c.email.emailId, e.target.value as Stage)}
          onClick={(e) => e.stopPropagation()}
          className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ring-1 ring-inset border-none outline-none cursor-pointer ${STAGE_BADGE[c.email.stage]}`}
        >
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      ),
    },
    {
      key: "matchScore", header: "Match", width: "70px", align: "right",
      render: (c) => c.eval
        ? <span className={`font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${scoreColor(c.eval.matchScore)}`}>{c.eval.matchScore}%</span>
        : <span className="text-gray-300">—</span>,
    },
  ], [handleStageChange]);

  // Compact card row for the narrow pane. Deliberately tight: the metadata all
  // shares one line as "stage · experience · location · role" rather than each
  // getting its own, so noticeably more candidates fit on screen while showing
  // strictly more per candidate than a 4-column table would at this width.
  const renderCompactRow = useCallback((c: Candidate) => {
    const name = isPresent(c.email.candidateName) ? c.email.candidateName : parseSender(c.email.from).name;
    const meta = [
      c.email.candidateExperience,
      c.email.candidateLocation,
      c.email.candidateRole,
    ].filter(isPresent);
    return (
      <div className="min-w-0 leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="flex-1 min-w-0 truncate text-xs font-semibold text-gray-900">{name}</span>
          {c.eval && (
            <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 rounded-full ${scoreColor(c.eval.matchScore)}`}>
              {c.eval.matchScore}%
            </span>
          )}
          <span className="flex-shrink-0 text-[10px] text-gray-400">{formatRelative(c.email.date)}</span>
        </div>
        <p className="truncate text-[11px] text-gray-500">{c.email.subject || "(No Subject)"}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5 min-w-0">
          <span className={`flex-shrink-0 text-[9px] font-semibold px-1.5 rounded-full ring-1 ring-inset ${STAGE_BADGE[c.email.stage]}`}>
            {c.email.stage}
          </span>
          {meta.length > 0 && (
            <span className="truncate text-[10px] text-gray-400" title={meta.join(" · ")}>{meta.join(" · ")}</span>
          )}
          {c.email.candidateSkills.length > 0 && (
            <span className="flex-shrink-0 text-[9px] text-cyan-600" title={c.email.candidateSkills.join(", ")}>
              {c.email.candidateSkills.length} skills
            </span>
          )}
        </div>
      </div>
    );
  }, []);

  // Below the widest tier the list pane is too narrow to lay filters out
  // inline — FilterBar collapses them behind one button instead of wrapping
  // onto three rows.
  const isCompactBar = listTier !== "full";

  const listPane = (
    <>
      <FilterBar
        accent="violet"
        compact={isCompactBar}
        leading={
          <div className="flex items-baseline gap-1.5 flex-shrink-0 mr-0.5">
            <h1 className="text-sm font-bold text-gray-900">Hiring</h1>
            <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
              {total.toLocaleString()}
              {hasFilters && visibleCandidates.length !== rows.length && (
                <span className="ml-1"> · {visibleCandidates.length} shown</span>
              )}
            </span>
          </div>
        }
        search={searchInput}
        onSearchChange={setSearchInput}
        searchInputRef={searchRef}
        searchPlaceholder="Search candidate, subject, email…  (/)"
        filters={[
          { key: "stage", label: "Stage", options: STAGES.map((s) => ({ value: s, label: s, count: counts.stageCounts[s] })), selected: stageFilter, onChange: setStageFilter },
          { key: "skills", label: "Skills", options: availableSkills.map((s) => ({ value: s, label: s })), selected: skillFilter, onChange: setSkillFilter },
          { key: "tags", label: "Tags", options: availableTags.map((t) => ({ value: t, label: t })), selected: tagFilter, onChange: setTagFilter },
          { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })), selected: statusFilter, onChange: setStatusFilter },
        ]}
        onClearAll={clearFilters}
        extraFilters={
          <>
            <DateRangeFilter accent="violet" dateFrom={dateFrom} dateTo={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
            <input
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              placeholder="Keyword in resume…"
              title="Searches the AI-extracted key points and skills for this word"
              className="h-8 w-36 text-[13px] rounded-lg border border-gray-200 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors"
            />
            {/* Five match pills collapsed into one select — same filtering,
                about a third of the width. */}
            {(hasEvaluations || candidateFilter) && (
              <select
                value={candidateFilter}
                onChange={(e) => setCandidateFilter(e.target.value as MatchFilter)}
                aria-label="Filter by match score"
                className={`h-8 text-[13px] rounded-lg border px-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors
                  ${candidateFilter ? "border-violet-300 bg-violet-50 text-violet-700 font-medium" : "border-gray-200 bg-white text-gray-600"}`}
              >
                {MATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </>
        }
        extraFiltersActive={!!(dateFrom || dateTo || candidateFilter || debouncedKeywords)}
        rightSlot={
          <>
            {/* Job criteria stays out of the collapsed Filters popover — it's
                what unlocks AI scoring, and it opens a panel of its own that
                would nest badly inside another one. */}
            <CriteriaPopover criteria={criteria} onChange={setCriteria} hasCriteria={hasCriteria} compact={isCompactBar} />
            <FilterPresetsMenu storageKey="filterPresets:hiring" currentFilters={currentFilterBag} onApply={applyFilterPreset} />
            {hasCriteria && rows.length > 0 && (
              <button
                onClick={evaluateAll}
                disabled={isEvaluatingAll || isLoading}
                title="Run AI evaluation for every candidate on this page against the job criteria"
                className={`flex items-center gap-1.5 h-8 rounded-lg bg-violet-100 hover:bg-violet-200 disabled:opacity-50 text-violet-700 text-[13px] font-medium transition-colors whitespace-nowrap ${isCompactBar ? "w-8 justify-center" : "px-2"}`}
              >
                {isEvaluatingAll
                  ? <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                }
                {!isCompactBar && <span>{isEvaluatingAll ? "Evaluating…" : "Evaluate Page"}</span>}
              </button>
            )}
            <button
              onClick={syncEmails} disabled={isSyncing}
              title="Check for new candidate emails since your last sync"
              className={`flex items-center gap-1.5 h-8 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium transition active:scale-[0.98] ${isCompactBar ? "w-8 justify-center" : "px-2.5"}`}
            >
              {isSyncing
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              }
              {!isCompactBar && <span>{isSyncing ? "Syncing…" : "Refresh"}</span>}
            </button>
          </>
        }
        isLoading={isLoading || searchInput !== debouncedSearch}
      />

      <div className="flex-1 overflow-hidden min-h-0">
        <DataTable
          variant={listTier === "narrow" ? "list" : "grid"}
          columns={listTier === "full" ? FULL_HIRING_COLUMNS : MEDIUM_HIRING_COLUMNS}
          renderRow={renderCompactRow}
          rows={visibleCandidates}
          rowKey={(c) => c.email.emailId}
          onRowClick={(c) => handleSelect(c.email)}
          isRowSelected={(c) => selectedId === c.email.emailId}
          sort={sort}
          onSortChange={setSort}
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
          isLoading={isLoading}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
              <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm">{hasFilters ? "No candidates match your filters" : "No hiring emails yet"}</p>
              {hasFilters ? (
                <button onClick={clearFilters} className="text-sm font-medium text-violet-600 hover:text-violet-700">Clear filters →</button>
              ) : (
                <button onClick={syncEmails} className="text-sm font-medium text-violet-600 hover:text-violet-700">Sync now to fetch your emails →</button>
              )}
            </div>
          }
        />
      </div>
    </>
  );

  const detailPane = selectedEmail ? (
    <DetailPanel
      key={selectedEmail.emailId}
      email={selectedEmail}
      evalState={evaluations.get(selectedEmail.emailId) ?? null}
      position={currentIndex >= 0 ? { index: currentIndex, total: visibleCandidates.length } : null}
      onPrev={() => goRelative(-1)}
      onNext={() => goRelative(1)}
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
  ) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <SplitPane
        storageKey="split:hiring"
        left={listPane}
        right={detailPane}
        defaultLeftWidth={480}
        minLeftWidth={280}
        minRightWidth={420}
        onLeftWidthChange={handleListWidth}
      />
    </div>
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────

interface DetailPanelProps {
  email: EmailSummary;
  evalState: EvalState | null;
  position: { index: number; total: number } | null;
  onPrev: () => void;
  onNext: () => void;
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

// Above this pane width the AI insights and the original email lay out as two
// columns rather than one-at-a-time behind tabs — filling a wide detail pane.
const HIRING_TWO_COL_WIDTH = 940;

// The structured resume data the AI extracts (role, experience, skills,
// education, employment logistics). Surfacing it in the detail pane means the
// candidate's full profile is right there while you read the email. Fields the
// AI couldn't determine (null, or a "Not specified" placeholder — see
// isPresent) are dropped entirely, so the card only ever shows real data
// instead of a column of "Not specified".
function CandidateProfileCard({ email }: { email: EmailSummary }) {
  const rows: { label: string; value: string }[] = [
    { label: "Current Role", value: email.candidateRole ?? "" },
    { label: "Experience", value: email.candidateExperience ?? "" },
    { label: "Location", value: email.candidateLocation ?? "" },
    { label: "Employment", value: email.candidateEmploymentStatus ?? "" },
    { label: "Notice Period", value: email.candidateNoticePeriod ?? "" },
    { label: "Type", value: email.candidateEmploymentType ?? "" },
    { label: "Education", value: email.candidateEducation ?? "" },
  ].filter((r) => isPresent(r.value));

  const hasSkills = email.candidateSkills.length > 0;
  const hasAchievements = isPresent(email.candidateAchievements);
  if (rows.length === 0 && !hasSkills && !hasAchievements) return null;

  return (
    <section>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Candidate Profile
      </p>

      <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 space-y-2">
        {rows.length > 0 && (
          // Short values (Full-time, Immediate, Remote) waste most of a
          // half-width column, so pack three across; long ones like Education
          // span the full row instead of wrapping into a narrow sliver.
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
            {rows.map((r) => (
              <div key={r.label} className={`min-w-0 ${r.value.length > 34 ? "col-span-3" : ""}`}>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 leading-tight">{r.label}</dt>
                <dd className="text-[12px] text-gray-800 leading-snug break-words">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {hasSkills && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Skills <span className="font-normal normal-case tracking-normal">({email.candidateSkills.length})</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {email.candidateSkills.map((s) => (
                <span key={s} className="text-[10px] font-medium px-1.5 py-px rounded-full bg-white text-cyan-700 ring-1 ring-cyan-200 whitespace-nowrap">{s}</span>
              ))}
            </div>
          </div>
        )}

        {hasAchievements && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Key Achievements</p>
            <p className="text-[12px] text-gray-700 leading-snug">{email.candidateAchievements}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DetailPanel({
  email, evalState, position, onPrev, onNext, detailTab, onTabChange, onClose,
  onEvaluate, hasCriteria, isLoadingDetail, onTagsChange, availableTags, onStageChange,
}: DetailPanelProps) {
  const sender = parseSender(email.from);
  const evaluated = evalState?.result ?? null;
  const candidateName = (evaluated?.candidateName && evaluated.candidateName !== "Unknown Candidate")
    ? evaluated.candidateName : (isPresent(email.candidateName) ? email.candidateName : sender.name);
  const hasAttachments = (email.attachments?.length ?? 0) > 0;
  const [paneRef, paneWidth] = useElementWidth<HTMLDivElement>();
  const twoColumn = paneWidth >= HIRING_TWO_COL_WIDTH;

  // Insights column = extracted candidate profile + AI summary/highlights.
  const insightsBlock = (
    <div className="space-y-3">
      <CandidateProfileCard email={email} />
      <EmailInsightsPanel email={email} />
    </div>
  );

  // With a résumé attached, the covering email is rarely the point — it's
  // usually three lines of "please find attached". So the email gets a fixed
  // slice and the résumé takes everything else, instead of the other way round.
  const emailBlock = (
    <>
      <div className={hasAttachments
        ? "flex-shrink-0 h-[28%] min-h-[96px] flex flex-col pane-padx pt-2 pb-2"
        : "flex-1 min-h-0 flex flex-col pane-padx pt-3 pb-3"}>
        {(email.htmlBody || email.body) ? (
          email.htmlBody ? (
            <div className="flex-1 min-h-0 rounded-xl border border-gray-200 overflow-hidden">
              <iframe srcDoc={email.htmlBody} sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="w-full h-full bg-white block" style={{ border: "none" }} title="Email content" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200 overflow-y-auto">
              <LinkifiedText
                text={email.body ?? ""}
                className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words"
              />
            </div>
          )
        ) : isLoadingDetail ? (
          <DetailLoadingSkeleton message="Loading email content…" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p className="text-xs">No email body</p>
          </div>
        )}
      </div>

      {hasAttachments && (
        <div className="flex-1 min-h-0 flex flex-col border-t border-gray-100 pane-padx pt-2 pb-2">
          <p className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
            {email.attachments!.length === 1 ? "Résumé / Attachment" : `Attachments (${email.attachments!.length})`}
          </p>
          {/* A single attachment stretches to fill; several keep their fixed
              height and scroll, since they can't all be full-size at once. */}
          <div className={email.attachments!.length === 1
            ? "flex-1 min-h-0 flex flex-col"
            : "flex-1 min-h-0 overflow-y-auto space-y-2"}>
            {email.attachments!.map((att, i) => (
              <PdfViewer key={i} attachment={att} fill={email.attachments!.length === 1} />
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div ref={paneRef} className="flex-1 flex flex-col overflow-hidden bg-white animate-panel-in min-h-0">

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 pane-padx py-1.5 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={onClose}
          aria-label="Close candidate (Esc)"
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
          aria-label="Previous candidate (K)"
          title="Previous candidate (K)"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={onNext}
          disabled={!position || position.index >= position.total - 1}
          aria-label="Next candidate (J)"
          title="Next candidate (J)"
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

        {!evalState ? (
          <button onClick={onEvaluate} disabled={!hasCriteria}
            title={hasCriteria ? "Evaluate against job criteria" : "Set job criteria in the toolbar first"}
            className="flex items-center gap-1.5 h-7 px-2 rounded-lg bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98]">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Evaluate
          </button>
        ) : evalState.loading ? (
          <span className="flex items-center gap-1.5 text-violet-600 text-[11px]">
            <div className="w-3 h-3 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            Evaluating…
          </span>
        ) : evalState.error ? (
          <span className="text-[11px] text-red-500 truncate max-w-[180px]" title={evalState.error}>{evalState.error}</span>
        ) : evaluated ? (
          <button onClick={onEvaluate} className="text-[11px] text-gray-400 hover:text-gray-600 underline transition-colors">Re-evaluate</button>
        ) : null}

        <select
          value={email.stage}
          onChange={(e) => onStageChange(e.target.value as Stage)}
          aria-label="Hiring stage"
          title="Where this candidate is in your hiring process"
          className={`h-7 text-[11px] font-semibold rounded-lg px-1.5 border-0 ring-1 ring-inset cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${STAGE_BADGE[email.stage]}`}
        >
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Candidate header */}
      <div className="pane-padx py-2.5 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${avatarGradient(email.from)} flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm`}>
            {sender.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-gray-900 leading-tight truncate">{candidateName}</h2>
                <p className="text-[11px] text-gray-400 truncate">
                  {sender.email}
                  {isPresent(email.candidateExperience) && <span className="text-gray-500"> · {email.candidateExperience}</span>}
                </p>
                <p className="text-[12px] font-medium text-violet-500 truncate">{email.subject || "(No Subject)"}</p>
              </div>
              <span className="text-[11px] text-gray-400 flex-shrink-0">{formatFull(email.date)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span title="How urgent this application is" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset
                ${email.priority === "Critical" ? "bg-red-50 text-red-600 ring-red-200"
                  : email.priority === "High" ? "bg-orange-50 text-orange-600 ring-orange-200"
                  : email.priority === "Medium" ? "bg-yellow-50 text-yellow-700 ring-yellow-200"
                  : "bg-green-50 text-green-700 ring-green-200"}`}>
                {email.priority}
              </span>
              <span title="The overall tone of this email" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset capitalize
                ${email.sentiment === "positive" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : email.sentiment === "negative" ? "bg-red-50 text-red-600 ring-red-200"
                  : "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                {email.sentiment}
              </span>
              {email.actionRequired === "Yes" && (
                <span title="This candidate needs a reply or task from you" className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset bg-red-50 text-red-600 ring-red-200">Action Required</span>
              )}
              {hasAttachments && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset bg-gray-100 text-gray-600 ring-gray-200">
                  📎 {email.attachments!.length} PDF
                </span>
              )}
              <span className="w-px h-3.5 bg-gray-200 mx-0.5" />
              <div className="flex-1 min-w-[130px]">
                <TagInput variant="inline" value={email.tags} onChange={onTagsChange} placeholder="Add a tag…" suggestions={availableTags} />
              </div>
            </div>
          </div>
        </div>

        {/* Evaluation result */}
        {evaluated && (
          <div className={`mt-2.5 rounded-xl p-3 flex items-center gap-3 ${evaluated.recommendation === "Yes" ? "bg-emerald-50 border border-emerald-100" : "bg-red-50 border border-red-100"}`}>
            <ScoreRing score={evaluated.matchScore} />
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full mb-1
                ${evaluated.recommendation === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                {evaluated.recommendation === "Yes" ? "✓ Recommended" : "✗ Not Recommended"}
              </span>
              <p className="text-[13px] text-gray-700 leading-relaxed">{evaluated.reasoning}</p>
            </div>
          </div>
        )}
      </div>

      {/* Content. Wide enough → the candidate profile + AI insights sit beside
          the original email, filling the pane; otherwise fall back to tabs. */}
      {twoColumn ? (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Deliberately the narrower column: it's text that stops when it
              stops, whereas the résumé beside it uses every pixel it's given. */}
          <section className="w-[38%] max-w-[520px] min-w-[320px] flex flex-col min-h-0 border-r border-gray-200">
            <p className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 pane-padx py-1.5 border-b border-gray-100">AI Insights</p>
            <div className="flex-1 overflow-y-auto pane-padx py-3">{insightsBlock}</div>
          </section>
          <section className="flex-1 flex flex-col min-h-0">
            <p className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 pane-padx py-1.5 border-b border-gray-100">Original Email</p>
            {emailBlock}
          </section>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 border-b border-gray-200 pane-padx flex-shrink-0">
            {(["insights", "email"] as const).map(tab => (
              <button key={tab} onClick={() => onTabChange(tab)}
                className={`py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors
                  ${detailTab === tab ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab === "insights" ? "AI Insights" : "Original Email"}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {detailTab === "insights" && <div className="flex-1 overflow-y-auto pane-padx py-4">{insightsBlock}</div>}
            {detailTab === "email" && emailBlock}
          </div>
        </>
      )}
    </div>
  );
}
