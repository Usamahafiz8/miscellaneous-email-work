"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { EmailSummary, Stage } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { isTypingTarget, isGSequenceKey } from "@/lib/keyboard";
import { orDash } from "@/lib/utils";
import { useDashboard } from "./DashboardProvider";
import DataTable, { type ColumnDef, type DataTableSort } from "./DataTable";
import FilterBar from "./FilterBar";

const STAGE_BADGE: Record<Stage, string> = {
  New: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Shortlisted: "bg-violet-50 text-violet-700 ring-violet-200",
  Interviewing: "bg-amber-50 text-amber-700 ring-amber-200",
  Offer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-red-50 text-red-600 ring-red-200",
  Hired: "bg-green-50 text-green-700 ring-green-200",
};

export default function CandidateSheetView() {
  const router = useRouter();
  const { syncVersion, patchEmail, availableSkills } = useDashboard();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [debouncedKeywords, setDebouncedKeywords] = useState("");
  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Server-side sort, same as Inbox/Hiring — every sortable key below is a real
  // EmailSummary column on the server's sort whitelist (lib/queryParams.ts).
  const [sort, setSort] = useState<DataTableSort>({ field: "date", order: "desc" });

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeywords(keywordsInput), 300);
    return () => clearTimeout(t);
  }, [keywordsInput]);

  // Any filter/search change resets to page 1 — otherwise you could land on
  // an empty page of a filter that now only has fewer pages of results.
  useEffect(() => { setPage(1); }, [debouncedSearch, skillFilter, stageFilter, debouncedKeywords, sort]);

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
    skillFilter.forEach((s) => params.append("skill", s));
    stageFilter.forEach((s) => params.append("stage", s));
    if (debouncedKeywords) params.set("keywords", debouncedKeywords);
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
  }, [page, pageSize, debouncedSearch, skillFilter, stageFilter, debouncedKeywords, sort]);

  useEffect(() => { fetchPage(); }, [fetchPage, syncVersion]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (isGSequenceKey()) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleStageChange = useCallback((emailId: string, stage: Stage) => {
    setRows((prev) => prev.map((r) => (r.emailId === emailId ? { ...r, stage } : r)));
    patchEmail(emailId, { stage });
  }, [patchEmail]);

  function clearFilters() {
    setSearchInput("");
    setSkillFilter([]);
    setStageFilter([]);
    setKeywordsInput("");
  }

  const hasFilters = !!(debouncedSearch || skillFilter.length || stageFilter.length || debouncedKeywords);

  const columns: ColumnDef<EmailSummary>[] = useMemo(() => [
    {
      key: "candidateName", header: "Name", width: "170px", sortable: true,
      render: (r) => <span className="truncate block font-semibold text-gray-900">{orDash(r.candidateName)}</span>,
    },
    {
      key: "candidateRole", header: "Current Role", width: "170px", sortable: true,
      render: (r) => <span className="truncate block text-gray-700">{orDash(r.candidateRole)}</span>,
    },
    {
      key: "candidateExperience", header: "Experience", width: "130px", sortable: true,
      render: (r) => <span className="truncate block text-gray-700">{orDash(r.candidateExperience)}</span>,
    },
    {
      key: "candidateSkills", header: "Skills", width: "240px",
      render: (r) =>
        r.candidateSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.candidateSkills.slice(0, 5).map((s) => (
              <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 whitespace-nowrap">{s}</span>
            ))}
            {r.candidateSkills.length > 5 && (
              <span className="text-[10px] text-gray-400" title={r.candidateSkills.slice(5).join(", ")}>
                +{r.candidateSkills.length - 5}
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: "candidateEducation", header: "Education", width: "190px",
      render: (r) => <span className="truncate block text-gray-700" title={r.candidateEducation ?? undefined}>{orDash(r.candidateEducation)}</span>,
    },
    {
      key: "candidateAchievements", header: "Key Achievements", width: "240px",
      render: (r) => <span className="truncate block text-gray-600" title={r.candidateAchievements ?? undefined}>{orDash(r.candidateAchievements)}</span>,
    },
    {
      key: "candidateLocation", header: "Location", width: "130px",
      render: (r) => <span className="truncate block text-gray-700">{orDash(r.candidateLocation)}</span>,
    },
    {
      key: "candidateNoticePeriod", header: "Notice", width: "110px",
      render: (r) => <span className="truncate block text-gray-700">{orDash(r.candidateNoticePeriod)}</span>,
    },
    {
      key: "stage", header: "Stage", width: "128px", sortable: true,
      headerHint: "Where this candidate is in your hiring process — click to move them",
      render: (r) => (
        <select
          value={r.stage}
          onChange={(e) => handleStageChange(r.emailId, e.target.value as Stage)}
          onClick={(e) => e.stopPropagation()}
          title="Where this candidate is in your hiring process"
          className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ring-1 ring-inset border-none outline-none cursor-pointer ${STAGE_BADGE[r.stage]}`}
        >
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      ),
    },
    {
      key: "tags", header: "Tags", width: "160px",
      render: (r) =>
        r.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.tags.map((t) => (
              <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 whitespace-nowrap">{t}</span>
            ))}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ], [handleStageChange]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* One toolbar row instead of the old title strip + filter strip — the
          sheet is a wide table, so every row of chrome removed is a row of
          candidate data gained. */}
      <FilterBar
        accent="violet"
        leading={
          <div className="flex items-baseline gap-1.5 flex-shrink-0 mr-0.5">
            <h1 className="text-sm font-bold text-gray-900">Candidate Sheet</h1>
            <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
              {total.toLocaleString()} candidate{total !== 1 ? "s" : ""}
            </span>
          </div>
        }
        search={searchInput}
        onSearchChange={setSearchInput}
        searchInputRef={searchRef}
        searchPlaceholder="Search candidate, subject, email…  (/)"
        filters={[
          { key: "skills", label: "Skills", options: availableSkills.map((s) => ({ value: s, label: s })), selected: skillFilter, onChange: setSkillFilter },
          { key: "stage", label: "Stage", options: STAGES.map((s) => ({ value: s, label: s })), selected: stageFilter, onChange: setStageFilter },
        ]}
        extraFilters={
          <input
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            placeholder="Keyword in resume…"
            title="Searches the AI-extracted key points and skills for this word"
            className="h-8 w-44 text-[13px] rounded-lg border border-gray-200 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors"
          />
        }
        extraFiltersActive={!!debouncedKeywords}
        onClearAll={clearFilters}
        rightSlot={
          <span className="text-[11px] text-gray-400 hidden lg:inline">
            Extracted resume data · one row per candidate
          </span>
        }
        isLoading={isLoading || searchInput !== debouncedSearch}
      />

      <div className="flex-1 overflow-hidden min-h-0">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.emailId}
          onRowClick={(r) => router.push(`/hiring/${encodeURIComponent(r.emailId)}`)}
          sort={sort}
          onSortChange={setSort}
          pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          isLoading={isLoading}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
              <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7a2 2 0 012-2h6a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2zM9 17H7a2 2 0 01-2-2V9m4 2h6m-6 4h6" />
              </svg>
              <p className="text-sm">No candidates found</p>
              {hasFilters ? (
                <button onClick={clearFilters} className="text-sm font-medium text-violet-600 hover:text-violet-700">Clear filters →</button>
              ) : (
                <p className="text-xs text-gray-300">Sync your inbox to pull in new applications</p>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
