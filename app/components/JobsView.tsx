"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { JobPosting, JobCandidateMatch } from "@/lib/types";
import { useDashboard } from "./DashboardProvider";
import DataTable, { type ColumnDef } from "./DataTable";
import TagInput from "./TagInput";
import { parseSender, formatRelative } from "@/lib/utils";

// Local draft shape for the editable requirements form — number fields are kept
// as strings while being edited (so an input can be legitimately empty), and
// converted to number | null only when PATCHing.
interface RequirementsDraft {
  minExperienceYears: string;
  maxExperienceYears: string;
  techStack: string[];
  skills: string[];
  requiredEmploymentStatus: string;
  requiredNoticePeriod: string;
  requiredLocation: string;
  requiredEmploymentType: string;
  otherCriteria: string;
}

const EMPTY_DRAFT: RequirementsDraft = {
  minExperienceYears: "", maxExperienceYears: "", techStack: [], skills: [],
  requiredEmploymentStatus: "", requiredNoticePeriod: "", requiredLocation: "",
  requiredEmploymentType: "", otherCriteria: "",
};

function draftFromJob(job: JobPosting): RequirementsDraft {
  return {
    minExperienceYears: job.minExperienceYears != null ? String(job.minExperienceYears) : "",
    maxExperienceYears: job.maxExperienceYears != null ? String(job.maxExperienceYears) : "",
    techStack: job.techStack,
    skills: job.skills,
    requiredEmploymentStatus: job.requiredEmploymentStatus ?? "",
    requiredNoticePeriod: job.requiredNoticePeriod ?? "",
    requiredLocation: job.requiredLocation ?? "",
    requiredEmploymentType: job.requiredEmploymentType ?? "",
    otherCriteria: job.otherCriteria ?? "",
  };
}

// Whether a job has *any* requirement set at all — mirrors HiringView's
// `hasCriteria` gate concept, used to disable scanning until there's something
// meaningful to score candidates against.
function hasAnyCriteria(job: JobPosting): boolean {
  return (
    job.techStack.length > 0 ||
    job.skills.length > 0 ||
    job.minExperienceYears != null ||
    job.maxExperienceYears != null ||
    !!job.requiredEmploymentStatus ||
    !!job.requiredNoticePeriod ||
    !!job.requiredLocation ||
    !!job.requiredEmploymentType ||
    !!job.otherCriteria
  );
}

interface ScanResult {
  total: number;
  matched: number;
  skipped: number;
  scannedAt: string;
}

const THRESHOLD_OPTIONS: { label: string; value: number }[] = [
  { label: "All", value: 0 },
  { label: "50%", value: 50 },
  { label: "60%", value: 60 },
  { label: "70%", value: 70 },
  { label: "80%", value: 80 },
];

function Spinner({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function JobsView() {
  const router = useRouter();
  const { availableSkills } = useDashboard();

  // ── Left pane: job list ──────────────────────────────────────────────
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [isCreatingJob, setIsCreatingJob] = useState(false);

  const fetchJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setJobs(data.jobs ?? []);
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  const handleCreateJob = useCallback(async () => {
    const title = newJobTitle.trim();
    if (!title) return;
    setIsCreatingJob(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.job) {
        setNewJobTitle("");
        setJobs((prev) => [data.job, ...prev]);
        setSelectedJobId(data.job.id);
      }
    } finally {
      setIsCreatingJob(false);
    }
  }, [newJobTitle]);

  const handleDeleteJob = useCallback(async (id: string) => {
    if (!window.confirm("Delete this job posting? This cannot be undone.")) return;
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setSelectedJobId((cur) => (cur === id ? null : cur));
    }
  }, []);

  // ── Right pane: selected job's JD, requirements, scan, matches ───────
  const [jobDescriptionDraft, setJobDescriptionDraft] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [requirementsDraft, setRequirementsDraft] = useState<RequirementsDraft>(EMPTY_DRAFT);
  const [requirementsOpen, setRequirementsOpen] = useState(true);
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);

  const [titleDraft, setTitleDraft] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const [threshold, setThreshold] = useState(60);
  const [matches, setMatches] = useState<JobCandidateMatch[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  // Re-seed drafts only when the *selection* changes, not on every jobs refetch
  // (e.g. a scan bumping lastScannedAt shouldn't clobber in-progress edits).
  useEffect(() => {
    if (selectedJob) {
      setJobDescriptionDraft(selectedJob.jobDescription ?? "");
      setRequirementsDraft(draftFromJob(selectedJob));
      setTitleDraft(selectedJob.title);
    } else {
      setJobDescriptionDraft("");
      setRequirementsDraft(EMPTY_DRAFT);
      setTitleDraft("");
    }
    setIsEditingTitle(false);
    setExtractError(null);
    setScanResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  const fetchMatches = useCallback(async () => {
    if (!selectedJobId) {
      setMatches([]);
      return;
    }
    setIsLoadingMatches(true);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(selectedJobId)}/matches?threshold=${threshold}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) setMatches(data.matches ?? []);
    } finally {
      setIsLoadingMatches(false);
    }
  }, [selectedJobId, threshold]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  const handleSaveTitle = useCallback(async () => {
    setIsEditingTitle(false);
    if (!selectedJob) return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === selectedJob.title) {
      setTitleDraft(selectedJob.title);
      return;
    }
    const res = await fetch(`/api/jobs/${encodeURIComponent(selectedJob.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data.job) {
      setJobs((prev) => prev.map((j) => (j.id === selectedJob.id ? data.job : j)));
    }
  }, [selectedJob, titleDraft]);

  // PATCHes the JD only if it actually changed (avoids extracting from stale
  // stored text if the user just edited the textarea), then extracts.
  const handleSaveAndExtract = useCallback(async () => {
    if (!selectedJob) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const jobId = selectedJob.id;
      if (jobDescriptionDraft !== (selectedJob.jobDescription ?? "")) {
        const patchRes = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobDescription: jobDescriptionDraft }),
        });
        const patchData = await patchRes.json().catch(() => null);
        if (patchRes.ok && patchData?.success && patchData.job) {
          setJobs((prev) => prev.map((j) => (j.id === jobId ? patchData.job : j)));
        }
      }

      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/extract`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? data.job : j)));
        setRequirementsDraft(draftFromJob(data.job));
        setExtractError(null);
      } else {
        setExtractError(data?.error ?? "Could not extract structured requirements — edit the fields manually below.");
      }
    } finally {
      setIsExtracting(false);
    }
  }, [selectedJob, jobDescriptionDraft]);

  const handleSaveRequirements = useCallback(async () => {
    if (!selectedJob) return;
    setIsSavingRequirements(true);
    try {
      const body = {
        minExperienceYears: requirementsDraft.minExperienceYears.trim() === "" ? null : Number(requirementsDraft.minExperienceYears),
        maxExperienceYears: requirementsDraft.maxExperienceYears.trim() === "" ? null : Number(requirementsDraft.maxExperienceYears),
        techStack: requirementsDraft.techStack,
        skills: requirementsDraft.skills,
        requiredEmploymentStatus: requirementsDraft.requiredEmploymentStatus || null,
        requiredNoticePeriod: requirementsDraft.requiredNoticePeriod.trim() || null,
        requiredLocation: requirementsDraft.requiredLocation.trim() || null,
        requiredEmploymentType: requirementsDraft.requiredEmploymentType || null,
        otherCriteria: requirementsDraft.otherCriteria.trim() || null,
      };
      const res = await fetch(`/api/jobs/${encodeURIComponent(selectedJob.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === selectedJob.id ? data.job : j)));
        setRequirementsDraft(draftFromJob(data.job));
      }
    } finally {
      setIsSavingRequirements(false);
    }
  }, [selectedJob, requirementsDraft]);

  const handleScan = useCallback(async () => {
    if (!selectedJob) return;
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(selectedJob.id)}/scan`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setScanResult({ total: data.total, matched: data.matched, skipped: data.skipped, scannedAt: data.scannedAt });
        await Promise.all([fetchJobs(), fetchMatches()]);
      }
    } finally {
      setIsScanning(false);
    }
  }, [selectedJob, fetchJobs, fetchMatches]);

  const hasCriteria = !!selectedJob && hasAnyCriteria(selectedJob);

  const columns: ColumnDef<JobCandidateMatch>[] = useMemo(() => [
    {
      key: "matchScore", header: "Match %", width: "80px",
      render: (m) => {
        const color = m.matchScore >= 70 ? "bg-emerald-100 text-emerald-700" : m.matchScore >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
        return <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${color}`}>{m.matchScore}%</span>;
      },
    },
    {
      key: "candidate", header: "Candidate", width: "160px",
      render: (m) => (
        <span className="truncate block text-xs font-semibold text-gray-900">
          {m.emailSummary.candidateName || parseSender(m.emailSummary.from).name}
        </span>
      ),
    },
    {
      key: "role", header: "Role", width: "150px",
      render: (m) => <span className="truncate block text-xs text-gray-700">{m.emailSummary.candidateRole ?? "—"}</span>,
    },
    {
      key: "experience", header: "Experience", width: "110px",
      render: (m) => <span className="truncate block text-xs text-gray-700">{m.emailSummary.candidateExperience ?? "—"}</span>,
    },
    {
      key: "skills", header: "Skills", width: "200px",
      render: (m) =>
        m.emailSummary.candidateSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {m.emailSummary.candidateSkills.slice(0, 3).map((s) => (
              <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 whitespace-nowrap">{s}</span>
            ))}
            {m.emailSummary.candidateSkills.length > 3 && (
              <span className="text-[10px] text-gray-400">+{m.emailSummary.candidateSkills.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        ),
    },
    {
      key: "employmentStatus", header: "Employment Status", width: "140px",
      render: (m) => <span className="text-xs text-gray-700">{m.emailSummary.candidateEmploymentStatus ?? "—"}</span>,
    },
    {
      key: "noticePeriod", header: "Notice Period", width: "120px",
      render: (m) => <span className="text-xs text-gray-700">{m.emailSummary.candidateNoticePeriod ?? "—"}</span>,
    },
    {
      key: "location", header: "Location", width: "130px",
      render: (m) => <span className="text-xs text-gray-700">{m.emailSummary.candidateLocation ?? "—"}</span>,
    },
    {
      key: "employmentType", header: "Employment Type", width: "130px",
      render: (m) => <span className="text-xs text-gray-700">{m.emailSummary.candidateEmploymentType ?? "—"}</span>,
    },
    {
      key: "recommendation", header: "Recommend", width: "100px",
      render: (m) => (
        <span className={`text-xs font-semibold whitespace-nowrap ${m.recommendation === "Yes" ? "text-emerald-600" : "text-red-500"}`}>
          {m.recommendation}
        </span>
      ),
    },
  ], []);

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* ── Left pane: job list ─────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3.5 border-b border-gray-200 flex-shrink-0">
          <h1 className="text-base font-bold text-gray-900 mb-2.5">Jobs</h1>
          <div className="flex items-center gap-1.5">
            <input
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateJob(); } }}
              placeholder="New job title…"
              className="flex-1 min-w-0 text-sm rounded-lg border border-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
            <button
              onClick={handleCreateJob}
              disabled={!newJobTitle.trim() || isCreatingJob}
              className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isCreatingJob && <Spinner className="w-3 h-3" />}
              + New
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoadingJobs && jobs.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">No job postings yet — create one above</div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={`group flex items-center gap-2 px-4 py-2.5 cursor-pointer border-b border-gray-100 transition-colors ${
                  selectedJobId === job.id ? "bg-indigo-50" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${selectedJobId === job.id ? "text-indigo-700" : "text-gray-800"}`}>
                    {job.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">
                      {job._count?.matches ?? 0} match{(job._count?.matches ?? 0) === 1 ? "" : "es"}
                    </span>
                    {job.lastScannedAt && (
                      <span className="text-[10px] text-gray-400 truncate">Scanned {formatRelative(job.lastScannedAt)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                  title="Delete job"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right pane: selected job detail ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedJob ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Select or create a job posting
          </div>
        ) : (
          <>
            <div className="flex-shrink-0 border-b border-gray-200 px-6 py-3.5 flex items-center justify-between gap-3">
              {isEditingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                  className="text-base font-bold text-gray-900 border-b border-indigo-400 focus:outline-none bg-transparent flex-1 min-w-0"
                />
              ) : (
                <h1
                  onClick={() => { setTitleDraft(selectedJob.title); setIsEditingTitle(true); }}
                  className="text-base font-bold text-gray-900 cursor-text truncate flex-1 min-w-0"
                  title="Click to edit"
                >
                  {selectedJob.title}
                </h1>
              )}
              <button
                onClick={() => handleDeleteJob(selectedJob.id)}
                className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200 transition-colors"
              >
                Delete
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* JD section */}
              <div className="px-6 py-4 border-b border-gray-100">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Job Description</label>
                <textarea
                  rows={6}
                  value={jobDescriptionDraft}
                  onChange={(e) => setJobDescriptionDraft(e.target.value)}
                  placeholder="Paste the full job description here…"
                  className="w-full text-xs font-mono rounded-lg border border-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-y"
                />
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <button
                    onClick={handleSaveAndExtract}
                    disabled={isExtracting || !jobDescriptionDraft.trim()}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isExtracting && <Spinner />}
                    Save & Extract Requirements
                  </button>
                  {extractError && (
                    <span className="text-xs text-amber-700 bg-amber-50 rounded-full px-2.5 py-1">{extractError}</span>
                  )}
                </div>
              </div>

              {/* Requirements panel */}
              <div className="border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setRequirementsOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      Requirements
                      {!hasCriteria && <span className="ml-2 text-xs font-normal text-gray-400">Set requirements to enable scanning</span>}
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${requirementsOpen ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {requirementsOpen && (
                  <div className="px-6 pb-5 pt-1 border-t border-gray-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4 max-w-xs">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Min years</label>
                        <input
                          type="number"
                          value={requirementsDraft.minExperienceYears}
                          onChange={(e) => setRequirementsDraft((d) => ({ ...d, minExperienceYears: e.target.value }))}
                          className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Max years</label>
                        <input
                          type="number"
                          value={requirementsDraft.maxExperienceYears}
                          onChange={(e) => setRequirementsDraft((d) => ({ ...d, maxExperienceYears: e.target.value }))}
                          className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Tech Stack</label>
                      <TagInput
                        value={requirementsDraft.techStack}
                        onChange={(v) => setRequirementsDraft((d) => ({ ...d, techStack: v }))}
                        placeholder="e.g. Node.js, Next.js, NestJS, React, Python"
                        suggestions={availableSkills}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Skills</label>
                      <TagInput
                        value={requirementsDraft.skills}
                        onChange={(v) => setRequirementsDraft((d) => ({ ...d, skills: v }))}
                        placeholder="e.g. Leadership, Agile, Communication"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Employment Status</label>
                        <select
                          value={requirementsDraft.requiredEmploymentStatus}
                          onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredEmploymentStatus: e.target.value }))}
                          className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
                        >
                          <option value="">—</option>
                          <option value="Currently Employed">Currently Employed</option>
                          <option value="Unemployed">Unemployed</option>
                          <option value="Either">Either</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Employment Type</label>
                        <select
                          value={requirementsDraft.requiredEmploymentType}
                          onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredEmploymentType: e.target.value }))}
                          className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
                        >
                          <option value="">—</option>
                          <option value="Full-time">Full-time</option>
                          <option value="Part-time">Part-time</option>
                          <option value="Contract">Contract</option>
                          <option value="Internship">Internship</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Notice Period</label>
                        <input
                          value={requirementsDraft.requiredNoticePeriod}
                          onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredNoticePeriod: e.target.value }))}
                          placeholder="e.g. Immediate, 30 days"
                          className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Location</label>
                        <input
                          value={requirementsDraft.requiredLocation}
                          onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredLocation: e.target.value }))}
                          placeholder="e.g. Remote, San Francisco"
                          className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Other Criteria</label>
                      <textarea
                        rows={2}
                        value={requirementsDraft.otherCriteria}
                        onChange={(e) => setRequirementsDraft((d) => ({ ...d, otherCriteria: e.target.value }))}
                        className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-y"
                      />
                    </div>

                    <div>
                      <button
                        onClick={handleSaveRequirements}
                        disabled={isSavingRequirements}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSavingRequirements && <Spinner />}
                        Save Requirements
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Scan */}
              <div className="px-6 py-4 flex items-center gap-3 flex-wrap border-b border-gray-100">
                <button
                  onClick={handleScan}
                  disabled={!hasCriteria || isScanning}
                  title={hasCriteria ? "Scan all Hiring candidates against this job's requirements" : "Set requirements first"}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isScanning && <Spinner />}
                  Scan All Candidates
                </button>
                {isScanning && (
                  <span className="text-xs text-gray-400">This can take a few minutes for a large candidate pool…</span>
                )}
                {!isScanning && scanResult && (
                  <span className="text-xs text-gray-500">
                    {scanResult.total} scanned — {scanResult.matched} matched, {scanResult.skipped} skipped · {formatRelative(scanResult.scannedAt)}
                  </span>
                )}
              </div>

              {/* Threshold picker */}
              <div className="px-6 pt-3 flex items-center gap-1.5 flex-wrap">
                {THRESHOLD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setThreshold(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      threshold === opt.value ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Results */}
              <div className="px-6 py-4">
                <DataTable
                  variant="grid"
                  columns={columns}
                  rows={matches}
                  rowKey={(m) => m.id}
                  onRowClick={(m) => router.push(`/hiring/${encodeURIComponent(m.emailId)}`)}
                  isLoading={isLoadingMatches}
                  fillHeight={false}
                  emptyState={
                    <div className="text-center text-gray-400 py-12 text-sm">No candidates match this job yet — run a scan above.</div>
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
