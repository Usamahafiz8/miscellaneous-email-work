"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { JobPosting, JobCandidateMatch } from "@/lib/types";
import { useDashboard } from "./DashboardProvider";
import DataTable, { type ColumnDef } from "./DataTable";
import TagInput from "./TagInput";
import SplitPane from "./ui/SplitPane";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { parseSender, formatRelative, orDash, isPresent } from "@/lib/utils";

// Local draft shape for the editable requirements form — number fields are kept
// as strings while being edited (so an input can be legitimately empty), and
// converted to number | null only when PATCHing.
interface RequirementsDraft {
  minExperienceYears: string;
  maxExperienceYears: string;
  techStack: string[];
  requiredEmploymentStatus: string;
  requiredNoticePeriod: string;
  requiredLocation: string;
  requiredEmploymentType: string;
  otherCriteria: string;
}

const EMPTY_DRAFT: RequirementsDraft = {
  minExperienceYears: "", maxExperienceYears: "", techStack: [],
  requiredEmploymentStatus: "", requiredNoticePeriod: "", requiredLocation: "",
  requiredEmploymentType: "", otherCriteria: "",
};

function draftFromJob(job: JobPosting): RequirementsDraft {
  return {
    minExperienceYears: job.minExperienceYears != null ? String(job.minExperienceYears) : "",
    maxExperienceYears: job.maxExperienceYears != null ? String(job.maxExperienceYears) : "",
    techStack: job.techStack,
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
  { label: "50%+", value: 50 },
  { label: "60%+", value: 60 },
  { label: "70%+", value: 70 },
  { label: "80%+", value: 80 },
];

const FIELD_CLASS =
  "w-full text-[13px] rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400";
const LABEL_CLASS = "block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1";

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
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();
  const { availableSkills, notify } = useDashboard();

  // ── Left pane: job list ──────────────────────────────────────────────
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  // Persisted in the URL (?job=<id>), not local state — otherwise navigating
  // away (e.g. clicking a matched candidate through to /hiring/[emailId]) and
  // back, or a page refresh, loses the selection and resets to the empty state.
  const selectedJobId = searchParams.get("job");
  const selectJob = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("job", id); else params.delete("job");
    router.replace(`/jobs${params.toString() ? `?${params.toString()}` : ""}`);
  }, [searchParams, router]);
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

  const visibleJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return q ? jobs.filter((j) => j.title.toLowerCase().includes(q)) : jobs;
  }, [jobs, jobSearch]);

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
        selectJob(data.job.id);
      } else {
        notify(data?.error ?? "Couldn't create that job posting", "error");
      }
    } finally {
      setIsCreatingJob(false);
    }
  }, [newJobTitle, selectJob, notify]);

  const handleDeleteJob = useCallback(async (id: string) => {
    if (!window.confirm("Delete this job posting? This cannot be undone.")) return;
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      setJobs((prev) => prev.filter((j) => j.id !== id));
      if (selectedJobId === id) selectJob(null);
      notify("Job posting deleted", "success");
    } else {
      notify("Couldn't delete that job posting", "error");
    }
  }, [selectedJobId, selectJob, notify]);

  // ── Right pane: selected job's JD, requirements, scan, matches ───────
  const [jobDescriptionDraft, setJobDescriptionDraft] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  const [requirementsDraft, setRequirementsDraft] = useState<RequirementsDraft>(EMPTY_DRAFT);
  // The setup form (job description + requirements) is something you fill in
  // once and then leave alone. It used to occupy most of the pane on every
  // visit, pushing the match results — the thing you actually come back for —
  // below the fold. Now it opens automatically only when there's nothing set up
  // yet, and otherwise collapses to a single row so matches get the height.
  const [setupOpen, setSetupOpen] = useState(false);
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
      setSetupOpen(!hasAnyCriteria(selectedJob));
    } else {
      setJobDescriptionDraft("");
      setRequirementsDraft(EMPTY_DRAFT);
      setTitleDraft("");
      setSetupOpen(false);
    }
    setIsEditingTitle(false);
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
        notify("Requirements filled in from the job description", "success");
      } else {
        notify(data?.error ?? "Couldn't extract structured requirements — edit the fields manually below.", "error");
      }
    } finally {
      setIsExtracting(false);
    }
  }, [selectedJob, jobDescriptionDraft, notify]);

  const handleSaveRequirements = useCallback(async () => {
    if (!selectedJob) return;
    setIsSavingRequirements(true);
    try {
      const body = {
        minExperienceYears: requirementsDraft.minExperienceYears.trim() === "" ? null : Number(requirementsDraft.minExperienceYears),
        maxExperienceYears: requirementsDraft.maxExperienceYears.trim() === "" ? null : Number(requirementsDraft.maxExperienceYears),
        techStack: requirementsDraft.techStack,
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
        notify("Requirements saved", "success");
      } else {
        notify("Couldn't save those requirements", "error");
      }
    } finally {
      setIsSavingRequirements(false);
    }
  }, [selectedJob, requirementsDraft, notify]);

  const handleScan = useCallback(async () => {
    if (!selectedJob) return;
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(selectedJob.id)}/scan`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setScanResult({ total: data.total, matched: data.matched, skipped: data.skipped, scannedAt: data.scannedAt });
        setSetupOpen(false);
        await Promise.all([fetchJobs(), fetchMatches()]);
      } else {
        notify(data?.error ?? "Scan failed — please try again", "error");
      }
    } finally {
      setIsScanning(false);
    }
  }, [selectedJob, fetchJobs, fetchMatches, notify]);

  const hasCriteria = !!selectedJob && hasAnyCriteria(selectedJob);

  const columns: ColumnDef<JobCandidateMatch>[] = useMemo(() => [
    {
      key: "matchScore", header: "Match", width: "78px", align: "right",
      headerHint: "How well this candidate fits the requirements set for this job",
      render: (m) => {
        const color = m.matchScore >= 70 ? "bg-emerald-100 text-emerald-700" : m.matchScore >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
        return <span className={`font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${color}`}>{m.matchScore}%</span>;
      },
    },
    {
      key: "candidate", header: "Candidate", width: "170px",
      render: (m) => (
        <span className="truncate block font-semibold text-gray-900">
          {isPresent(m.emailSummary.candidateName) ? m.emailSummary.candidateName : parseSender(m.emailSummary.from).name}
        </span>
      ),
    },
    {
      key: "role", header: "Role", width: "160px",
      render: (m) => <span className="truncate block text-gray-700">{orDash(m.emailSummary.candidateRole)}</span>,
    },
    {
      key: "experience", header: "Experience", width: "110px",
      render: (m) => <span className="truncate block text-gray-700">{orDash(m.emailSummary.candidateExperience)}</span>,
    },
    {
      key: "skills", header: "Skills", width: "220px",
      render: (m) =>
        m.emailSummary.candidateSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {m.emailSummary.candidateSkills.slice(0, 3).map((s) => (
              <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-700 whitespace-nowrap">{s}</span>
            ))}
            {m.emailSummary.candidateSkills.length > 3 && (
              <span className="text-[10px] text-gray-400" title={m.emailSummary.candidateSkills.slice(3).join(", ")}>
                +{m.emailSummary.candidateSkills.length - 3}
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: "employmentStatus", header: "Employment", width: "140px",
      render: (m) => <span className="truncate block text-gray-700">{orDash(m.emailSummary.candidateEmploymentStatus)}</span>,
    },
    {
      key: "noticePeriod", header: "Notice", width: "110px",
      render: (m) => <span className="truncate block text-gray-700">{orDash(m.emailSummary.candidateNoticePeriod)}</span>,
    },
    {
      key: "location", header: "Location", width: "130px",
      render: (m) => <span className="truncate block text-gray-700">{orDash(m.emailSummary.candidateLocation)}</span>,
    },
    {
      key: "employmentType", header: "Type", width: "120px",
      render: (m) => <span className="truncate block text-gray-700">{orDash(m.emailSummary.candidateEmploymentType)}</span>,
    },
    {
      key: "recommendation", header: "Recommend", width: "100px",
      headerHint: "AI's yes/no hiring recommendation based on the requirements",
      render: (m) => (
        <span className={`font-semibold whitespace-nowrap ${m.recommendation === "Yes" ? "text-emerald-600" : "text-red-500"}`}>
          {m.recommendation}
        </span>
      ),
    },
  ], []);

  // ── Left pane ────────────────────────────────────────────────────────
  const jobListPane = (
    <>
      <div className="bar-pad border-b border-gray-200 flex-shrink-0 space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-sm font-bold text-gray-900">Jobs</h1>
          <span className="text-[11px] text-gray-400 tabular-nums">{jobs.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={newJobTitle}
            onChange={(e) => setNewJobTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateJob(); } }}
            placeholder="New job title…"
            className="flex-1 min-w-0 h-8 text-[13px] rounded-lg border border-gray-200 px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
          <button
            onClick={handleCreateJob}
            disabled={!newJobTitle.trim() || isCreatingJob}
            title="Create a new job posting"
            className="flex-shrink-0 flex items-center gap-1 h-8 text-xs font-semibold px-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98]"
          >
            {isCreatingJob && <Spinner className="w-3 h-3" />}
            + New
          </button>
        </div>
        {jobs.length > 6 && (
          <input
            value={jobSearch}
            onChange={(e) => setJobSearch(e.target.value)}
            placeholder="Filter jobs…"
            className="w-full h-7 text-xs rounded-lg border border-gray-200 bg-gray-50 px-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoadingJobs && jobs.length === 0 ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10" />)}
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">
            {jobs.length === 0 ? "No job postings yet — create one above" : "No jobs match that filter"}
          </div>
        ) : (
          visibleJobs.map((job) => {
            const isSelected = selectedJobId === job.id;
            return (
              <div
                key={job.id}
                onClick={() => selectJob(job.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectJob(job.id); } }}
                className={`group flex items-center gap-2 row-pad cursor-pointer border-b border-gray-100 transition-colors ${
                  isSelected ? "bg-indigo-50 shadow-[inset_2px_0_0_theme(colors.indigo.500)]" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium truncate ${isSelected ? "text-indigo-700" : "text-gray-800"}`}>
                    {job.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 rounded-full whitespace-nowrap ${
                      (job._count?.matches ?? 0) > 0 ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {job._count?.matches ?? 0} match{(job._count?.matches ?? 0) === 1 ? "" : "es"}
                    </span>
                    {job.lastScannedAt
                      ? <span className="text-[10px] text-gray-400 truncate">Scanned {formatRelative(job.lastScannedAt)}</span>
                      : <span className="text-[10px] text-amber-600 truncate">Not scanned yet</span>}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                  title="Delete job"
                  aria-label={`Delete ${job.title}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  // ── Right pane ───────────────────────────────────────────────────────
  const jobDetailPane = !selectedJob ? null : (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 animate-panel-in">
      {/* Toolbar: title, scan, threshold, delete — one row. */}
      <div className="flex-shrink-0 border-b border-gray-200 bar-pad flex items-center gap-2 flex-wrap">
        {isEditingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
            className="text-sm font-bold text-gray-900 border-b border-indigo-400 focus:outline-none bg-transparent min-w-0 flex-1 max-w-xs"
          />
        ) : (
          <h1
            onClick={() => { setTitleDraft(selectedJob.title); setIsEditingTitle(true); }}
            className="text-sm font-bold text-gray-900 cursor-text truncate max-w-xs"
            title="Click to rename"
          >
            {selectedJob.title}
          </h1>
        )}

        <button
          onClick={() => setSetupOpen((o) => !o)}
          aria-expanded={setupOpen}
          title="Job description and the requirements candidates are scored against"
          className={`flex items-center gap-1.5 h-8 px-2 rounded-lg border text-[13px] transition-colors whitespace-nowrap ${
            hasCriteria
              ? "border-violet-300 bg-violet-50 text-violet-700 font-medium"
              : "border-dashed border-amber-300 bg-amber-50 text-amber-700 font-medium"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {hasCriteria ? "Requirements" : "Set requirements"}
          <svg className={`w-3 h-3 opacity-60 transition-transform ${setupOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          onClick={handleScan}
          disabled={!hasCriteria || isScanning}
          title={hasCriteria ? "Compare every hiring candidate against this job's requirements" : "Set requirements first"}
          className="flex items-center gap-1.5 h-8 text-[13px] font-semibold px-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98] whitespace-nowrap"
        >
          {isScanning && <Spinner />}
          {isScanning ? "Scanning…" : "Scan All Candidates"}
        </button>

        {isScanning && <span className="text-[11px] text-gray-400">This can take a few minutes for a large pool…</span>}
        {!isScanning && scanResult && (
          <span className="text-[11px] text-gray-500">
            {scanResult.total} scanned · {scanResult.matched} matched · {scanResult.skipped} skipped
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-gray-400 hidden lg:inline">Show</span>
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            {THRESHOLD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setThreshold(opt.value)}
                title={opt.value === 0 ? "Show every scanned candidate" : `Only candidates scoring ${opt.value}% or better`}
                className={`px-2 h-8 text-[11px] font-medium transition-colors ${
                  threshold === opt.value ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleDeleteJob(selectedJob.id)}
            title="Delete this job posting"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Setup — collapsible, capped at 55% of the pane so it can never push
          the match results off screen entirely. */}
      {setupOpen && (
        <div className="flex-shrink-0 max-h-[55%] overflow-y-auto border-b border-gray-200 bg-gray-50/60 px-4 py-3">
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Job description */}
            <div>
              <label className={LABEL_CLASS}>Job Description</label>
              <p className="text-[11px] text-gray-400 mb-1.5">Paste the job ad, then let AI fill in the requirements automatically.</p>
              <textarea
                rows={8}
                value={jobDescriptionDraft}
                onChange={(e) => setJobDescriptionDraft(e.target.value)}
                placeholder="Paste the full job description here…"
                className="w-full text-[12px] font-mono rounded-lg border border-gray-200 px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-y"
              />
              <button
                onClick={handleSaveAndExtract}
                disabled={isExtracting || !jobDescriptionDraft.trim()}
                title="AI will read the description and fill in the requirements beside it"
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98]"
              >
                {isExtracting && <Spinner />}
                {isExtracting ? "Reading description…" : "Save & Fill In Requirements"}
              </button>
            </div>

            {/* Requirements */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={LABEL_CLASS}>Min Years Exp.</label>
                  <input
                    type="number"
                    value={requirementsDraft.minExperienceYears}
                    placeholder="e.g. 3"
                    onChange={(e) => setRequirementsDraft((d) => ({ ...d, minExperienceYears: e.target.value }))}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Max Years Exp.</label>
                  <input
                    type="number"
                    value={requirementsDraft.maxExperienceYears}
                    placeholder="e.g. 8"
                    onChange={(e) => setRequirementsDraft((d) => ({ ...d, maxExperienceYears: e.target.value }))}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  Tech Stack &amp; Skills <span className="text-gray-400 font-normal normal-case">(type one, press Enter)</span>
                </label>
                <TagInput
                  value={requirementsDraft.techStack}
                  onChange={(v) => setRequirementsDraft((d) => ({ ...d, techStack: v }))}
                  placeholder="e.g. Node.js, React, Python, Leadership"
                  suggestions={availableSkills}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={LABEL_CLASS}>Employment Status</label>
                  <select
                    value={requirementsDraft.requiredEmploymentStatus}
                    onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredEmploymentStatus: e.target.value }))}
                    className={FIELD_CLASS}
                  >
                    <option value="">—</option>
                    <option value="Currently Employed">Currently Employed</option>
                    <option value="Unemployed">Unemployed</option>
                    <option value="Either">Either</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Employment Type</label>
                  <select
                    value={requirementsDraft.requiredEmploymentType}
                    onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredEmploymentType: e.target.value }))}
                    className={FIELD_CLASS}
                  >
                    <option value="">—</option>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={LABEL_CLASS}>Notice Period</label>
                  <input
                    value={requirementsDraft.requiredNoticePeriod}
                    onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredNoticePeriod: e.target.value }))}
                    placeholder="e.g. Immediate, 30 days"
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Location</label>
                  <input
                    value={requirementsDraft.requiredLocation}
                    onChange={(e) => setRequirementsDraft((d) => ({ ...d, requiredLocation: e.target.value }))}
                    placeholder="e.g. Remote, San Francisco"
                    className={FIELD_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>
                  Other Criteria <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={requirementsDraft.otherCriteria}
                  onChange={(e) => setRequirementsDraft((d) => ({ ...d, otherCriteria: e.target.value }))}
                  placeholder="e.g. Must have led a team, willing to travel occasionally…"
                  className={`${FIELD_CLASS} resize-y`}
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveRequirements}
                  disabled={isSavingRequirements}
                  title="Save these requirements so scanning candidates uses them"
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingRequirements && <Spinner />}
                  {isSavingRequirements ? "Saving…" : "Save Requirements"}
                </button>
                <button
                  onClick={() => setSetupOpen(false)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5"
                >
                  Collapse
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Matches — now the pane's main content, filling all remaining height
          with its own scroll, instead of sitting at the bottom of a long page. */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Matching Candidates</h2>
        <span className="text-[11px] text-gray-400 tabular-nums">
          {matches.length}{threshold > 0 ? ` at ${threshold}%+` : ""}
        </span>
        {selectedJob.lastScannedAt && (
          <span className="ml-auto text-[11px] text-gray-400">Last scanned {formatRelative(selectedJob.lastScannedAt)}</span>
        )}
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <DataTable
          variant="grid"
          columns={columns}
          rows={matches}
          rowKey={(m) => m.id}
          onRowClick={(m) => router.push(`/hiring/${encodeURIComponent(m.emailId)}`)}
          isLoading={isLoadingMatches}
          emptyState={
            <div className="text-center text-gray-400 py-10 text-sm max-w-sm">
              {!hasCriteria
                ? "Add requirements above, then scan to see matching candidates here."
                : selectedJob.lastScannedAt
                  ? `No candidates scored ${threshold}% or higher — try lowering the threshold.`
                  : "No matches yet — click “Scan All Candidates” above to compare candidates against this job."}
            </div>
          }
        />
      </div>
    </div>
  );

  // A job list is a narrow thing — letting it stretch across a 1400px screen
  // when nothing is selected would waste more space than it saves. So on
  // desktop the right side always holds *something* (detail or a prompt), and
  // only on mobile does the list take the full width.
  const emptyPane = (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
      <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7h-3V6a2 2 0 00-2-2H9a2 2 0 00-2 2v1H4a1 1 0 00-1 1v10a2 2 0 002 2h14a2 2 0 002-2V8a1 1 0 00-1-1zM9 6h6v1H9V6z" />
      </svg>
      <p className="text-sm text-gray-500 font-medium">Select a job on the left, or create a new one</p>
      <p className="text-xs text-gray-400 max-w-xs">
        Paste in a job description and AI will pull out the requirements, then score every candidate against them.
      </p>
    </div>
  );

  const rightPane = selectedJobId
    ? (jobDetailPane ?? <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading job…</div>)
    : (isDesktop ? emptyPane : null);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <SplitPane
        storageKey="split:jobs"
        left={jobListPane}
        right={rightPane}
        defaultLeftWidth={300}
        minLeftWidth={220}
        minRightWidth={520}
      />
    </div>
  );
}
