"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { EmailSummary, Stage } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { useDashboard } from "./DashboardProvider";
import DataTable, { type ColumnDef, type DataTableSort } from "./DataTable";
import MultiSelectFilter from "./MultiSelectFilter";

const SHEET_PAGE_SIZE = 300; // unpaged in practice — see DashboardProvider's OVERVIEW_PAGE_SIZE precedent

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
  const [keywordsInput, setKeywordsInput] = useState("");
  const [debouncedKeywords, setDebouncedKeywords] = useState("");
  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  // Client-side sort — correct here (unlike the paginated Inbox/Hiring views) since
  // the whole matching dataset is already loaded in one shot, not paged in from the server.
  const [sort, setSort] = useState<DataTableSort>({ field: "date", order: "desc" });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeywords(keywordsInput), 300);
    return () => clearTimeout(t);
  }, [keywordsInput]);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("pageSize", String(SHEET_PAGE_SIZE));
    params.append("category", "Hiring");
    if (debouncedSearch) params.set("search", debouncedSearch);
    skillFilter.forEach((s) => params.append("skill", s));
    if (debouncedKeywords) params.set("keywords", debouncedKeywords);
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
  }, [debouncedSearch, skillFilter, debouncedKeywords]);

  useEffect(() => { fetchAll(); }, [fetchAll, syncVersion]);

  function handleStageChange(emailId: string, stage: Stage) {
    setRows((prev) => prev.map((r) => (r.emailId === emailId ? { ...r, stage } : r)));
    patchEmail(emailId, { stage });
  }

  const sortedRows = useMemo(() => {
    const getValue = (r: EmailSummary): string => {
      if (sort.field === "candidateName") return r.candidateName ?? "";
      if (sort.field === "candidateExperience") return r.candidateExperience ?? "";
      return r.date;
    };
    return [...rows].sort((a, b) => {
      const cmp = getValue(a).localeCompare(getValue(b));
      return sort.order === "asc" ? cmp : -cmp;
    });
  }, [rows, sort]);

  const columns: ColumnDef<EmailSummary>[] = [
    {
      key: "candidateName", header: "Name", width: "160px", sortable: true,
      render: (r) => <span className="truncate block text-xs font-semibold text-gray-900">{r.candidateName ?? "—"}</span>,
    },
    {
      key: "candidateRole", header: "Current Role", width: "160px",
      render: (r) => <span className="text-xs text-gray-700">{r.candidateRole ?? "—"}</span>,
    },
    {
      key: "candidateExperience", header: "Experience", width: "130px",
      render: (r) => <span className="truncate block text-xs text-gray-700">{r.candidateExperience ?? "—"}</span>,
    },
    {
      key: "candidateSkills", header: "Skills", width: "220px",
      render: (r) =>
        r.candidateSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {r.candidateSkills.slice(0, 5).map((s) => (
              <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 whitespace-nowrap">{s}</span>
            ))}
            {r.candidateSkills.length > 5 && <span className="text-[10px] text-gray-400">+{r.candidateSkills.length - 5}</span>}
          </div>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        ),
    },
    {
      key: "candidateEducation", header: "Education", width: "180px",
      render: (r) => <span className="text-xs text-gray-700 truncate max-w-[180px] block">{r.candidateEducation ?? "—"}</span>,
    },
    {
      key: "candidateAchievements", header: "Key Achievements", width: "220px",
      render: (r) => <span className="text-xs text-gray-600 truncate max-w-[220px] block">{r.candidateAchievements ?? "—"}</span>,
    },
    {
      key: "stage", header: "Stage", width: "130px",
      render: (r) => (
        <select
          value={r.stage}
          onChange={(e) => handleStageChange(r.emailId, e.target.value as Stage)}
          onClick={(e) => e.stopPropagation()}
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
          <div className="flex flex-wrap gap-1 max-w-[160px]">
            {r.tags.map((t) => (
              <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 whitespace-nowrap">{t}</span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base font-bold text-gray-900">Candidate Sheet</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {total} candidate{total !== 1 ? "s" : ""} — extracted resume data, one row per candidate
          </p>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-xs">
          <div className="relative flex-1">
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search candidates… (try from: subject:)"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors"
            />
          </div>
          {searchInput.trim() !== "" && (searchInput !== debouncedSearch || isLoading) && (
            <span className="text-xs text-violet-500 font-medium animate-pulse flex-shrink-0">Searching…</span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50/50 px-6 py-2.5 flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Skills"
          options={availableSkills.map((s) => ({ value: s, label: s }))}
          selected={skillFilter}
          onChange={setSkillFilter}
        />
        <input
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="Keywords (key points & skills)…"
          className="text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors w-56"
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={sortedRows}
          rowKey={(r) => r.emailId}
          onRowClick={(r) => router.push(`/hiring/${encodeURIComponent(r.emailId)}`)}
          sort={sort}
          onSortChange={setSort}
          isLoading={isLoading}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
              <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7a2 2 0 012-2h6a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2zM9 17H7a2 2 0 01-2-2V9m4 2h6m-6 4h6" />
              </svg>
              <p className="text-sm">No candidates found</p>
            </div>
          }
        />
      </div>
    </div>
  );
}
