"use client";

import { useState, useMemo } from "react";
import type { EmailSummary, HiringCriteria, CandidateEvaluation } from "@/lib/types";
import { formatRelative, formatFull, parseSender, avatarGradient } from "@/lib/utils";
import PdfViewer from "./PdfViewer";
import EmailInsightsPanel from "./EmailInsightsPanel";

interface HiringViewProps {
  summaries: EmailSummary[];
  isLoading: boolean;
  onFetch: () => void;
  onLoadDetail: (emailId: string) => void;
  loadingDetailId: string | null;
}

interface EvalState {
  loading: boolean;
  result: CandidateEvaluation | null;
  error: string | null;
}

// ─── Tag input ───────────────────────────────────────────────────────────────

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
  };
  return (
    <div>
      <div className="flex gap-2 mb-2 flex-wrap">
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 rounded-full px-2.5 py-1 font-medium">
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-red-500 ml-0.5 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400" />
        <button type="button" onClick={add} className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-gray-600 hover:bg-gray-200 transition-colors">Add</button>
      </div>
    </div>
  );
}

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

export default function HiringView({ summaries, isLoading, onFetch, onLoadDetail, loadingDetailId }: HiringViewProps) {
  const [criteria, setCriteria] = useState<HiringCriteria>({ position: "", mandatory: [], optional: [] });
  const [criteriaOpen, setCriteriaOpen] = useState(true);
  const [evaluations, setEvaluations] = useState<Map<string, EvalState>>(new Map());
  const [isEvaluatingAll, setIsEvaluatingAll] = useState(false);
  const [selected, setSelected] = useState<EmailSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"insights" | "email">("insights");

  // Candidate filters
  const [search, setSearch] = useState("");
  const [filterEval, setFilterEval] = useState<"" | "evaluated" | "unevaluated">("");
  const [filterMatch, setFilterMatch] = useState<"" | "high" | "medium" | "low">("");

  const hasFilters = !!(search.trim() || filterEval || filterMatch);

  const hasCriteria = !!(criteria.position.trim() && criteria.mandatory.length > 0);

  const visibleCandidates = useMemo(() => {
    const getText = (e: EmailSummary) =>
      [e.summary, e.subject, e.from, ...e.keyPoints].join(" ").toLowerCase();

    const mandHits = (e: EmailSummary) =>
      hasCriteria ? criteria.mandatory.filter(r => getText(e).includes(r.toLowerCase())).length : 0;
    const optHits = (e: EmailSummary) =>
      hasCriteria ? criteria.optional.filter(r => getText(e).includes(r.toLowerCase())).length : 0;

    let scored = summaries.map(e => ({
      email: e,
      mand: mandHits(e),
      opt: optHits(e),
      eval: evaluations.get(e.emailId)?.result ?? null,
    }));

    // Search filter — name, email address, subject, summary, key points
    if (search.trim()) {
      const q = search.toLowerCase();
      scored = scored.filter(({ email }) => getText(email).includes(q));
    }

    // Evaluated / not evaluated filter
    if (filterEval === "evaluated") scored = scored.filter(c => c.eval !== null);
    if (filterEval === "unevaluated") scored = scored.filter(c => c.eval === null);

    // Match score filter (only applies when evaluated)
    if (filterMatch === "high") scored = scored.filter(c => c.eval && c.eval.matchScore >= 70);
    if (filterMatch === "medium") scored = scored.filter(c => c.eval && c.eval.matchScore >= 40 && c.eval.matchScore < 70);
    if (filterMatch === "low") scored = scored.filter(c => c.eval && c.eval.matchScore < 40);

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
  }, [summaries, evaluations, criteria, hasCriteria, search, filterEval, filterMatch]);

  const selectedEmail = selected
    ? (summaries.find(s => s.emailId === selected.emailId) ?? selected)
    : null;

  function handleSelect(email: EmailSummary) {
    if (selected?.emailId === email.emailId) { setSelected(null); return; }
    setSelected(email);
    setDetailTab("insights");
    onLoadDetail(email.emailId);
  }

  async function evaluate(email: EmailSummary) {
    if (!hasCriteria) return;
    setEvaluations(prev => new Map(prev).set(email.emailId, { loading: true, result: null, error: null }));
    try {
      const res = await fetch("/api/hiring/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: email.summary, keyPoints: email.keyPoints, subject: email.subject, criteria }),
      });
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) throw new Error(data.error ?? "Evaluation failed");
      setEvaluations(prev => new Map(prev).set(email.emailId, { loading: false, result: data.evaluation, error: null }));
    } catch (err) {
      setEvaluations(prev => new Map(prev).set(email.emailId, {
        loading: false, result: null,
        error: err instanceof Error ? err.message : "Failed",
      }));
    }
  }

  async function evaluateAll() {
    if (!hasCriteria || summaries.length === 0) return;
    setIsEvaluatingAll(true);
    // Run sequentially to avoid hammering the API
    for (const email of summaries) {
      const existing = evaluations.get(email.emailId);
      if (existing?.result) continue; // skip already evaluated
      await evaluate(email);
    }
    setIsEvaluatingAll(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">Hiring</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {summaries.length} candidate{summaries.length !== 1 ? "s" : ""}
            {hasCriteria ? ` · ${criteria.position}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasCriteria && summaries.length > 0 && (
            <button
              onClick={evaluateAll}
              disabled={isEvaluatingAll || isLoading}
              title="Run AI evaluation for all candidates against the job criteria"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-100 hover:bg-violet-200 disabled:opacity-50 text-violet-700 text-sm font-medium transition-colors"
            >
              {isEvaluatingAll
                ? <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              }
              <span className="hidden sm:inline">{isEvaluatingAll ? "Evaluating…" : "Evaluate All"}</span>
            </button>
          )}
          <button onClick={onFetch} disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {isLoading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            <span className="hidden sm:inline">{isLoading ? "Syncing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── Candidate search & filters ──────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50/50 px-4 py-2.5 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search candidates…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors"
          />
        </div>

        {/* Evaluated filter */}
        <select
          value={filterEval}
          onChange={e => setFilterEval(e.target.value as "" | "evaluated" | "unevaluated")}
          className={`text-sm rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors ${filterEval ? "border-violet-400 bg-violet-50 text-violet-700 font-medium" : "border-gray-200 bg-white text-gray-600"}`}
        >
          <option value="">All Candidates</option>
          <option value="evaluated">Evaluated only</option>
          <option value="unevaluated">Not yet evaluated</option>
        </select>

        {/* Match score filter — only useful after evaluating */}
        <select
          value={filterMatch}
          onChange={e => setFilterMatch(e.target.value as "" | "high" | "medium" | "low")}
          disabled={!summaries.some(s => evaluations.get(s.emailId)?.result)}
          className={`text-sm rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${filterMatch ? "border-violet-400 bg-violet-50 text-violet-700 font-medium" : "border-gray-200 bg-white text-gray-600"}`}
        >
          <option value="">Any Match Score</option>
          <option value="high">High match (≥70%)</option>
          <option value="medium">Medium match (40–69%)</option>
          <option value="low">Low match (&lt;40%)</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(""); setFilterEval(""); setFilterMatch(""); }}
            className="flex items-center gap-1 text-xs text-violet-600 font-medium hover:text-violet-800 px-2.5 py-2 rounded-lg border border-violet-200 bg-violet-50 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Clear
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400 hidden sm:block">
          {visibleCandidates.length}{hasFilters ? ` of ${summaries.length}` : ""} candidate{summaries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Job Criteria panel ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white">
        <button type="button" onClick={() => setCriteriaOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700">
              Job Criteria
              {hasCriteria && <span className="ml-2 text-xs font-normal text-gray-400">{criteria.position} · {criteria.mandatory.length} required</span>}
              {!hasCriteria && <span className="ml-2 text-xs font-normal text-gray-400">Set requirements to enable AI evaluation</span>}
            </span>
          </div>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${criteriaOpen ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {criteriaOpen && (
          <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Position</label>
              <input value={criteria.position} onChange={e => setCriteria(c => ({ ...c, position: e.target.value }))}
                placeholder="e.g. Senior React Developer"
                className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Must Have <span className="text-gray-400 font-normal normal-case">(Enter to add)</span>
              </label>
              <TagInput value={criteria.mandatory} onChange={v => setCriteria(c => ({ ...c, mandatory: v }))} placeholder="e.g. React, 5+ yrs" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Nice to Have</label>
              <TagInput value={criteria.optional} onChange={v => setCriteria(c => ({ ...c, optional: v }))} placeholder="e.g. TypeScript" />
            </div>
          </div>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {summaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm">No hiring emails found</p>
            <button onClick={onFetch} className="text-sm font-medium text-violet-600 hover:text-violet-700">Sync inbox →</button>
          </div>
        ) : visibleCandidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <p className="text-sm">No candidates match the current filters</p>
            <button onClick={() => { setSearch(""); setFilterEval(""); setFilterMatch(""); }} className="text-sm font-medium text-violet-600 hover:text-violet-700">Clear filters →</button>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[860px]">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Summary</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Match</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Result</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Attachments</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Evaluate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleCandidates.map(({ email, mand, opt, eval: evalResult }) => {
                const sender = parseSender(email.from);
                const isSelected = selectedEmail?.emailId === email.emailId;
                const evalState = evaluations.get(email.emailId) ?? null;
                const isEvaluating = evalState?.loading ?? false;
                const hasKwMatch = hasCriteria && !evalResult && (mand > 0 || opt > 0);

                return (
                  <tr
                    key={email.emailId}
                    onClick={() => handleSelect(email)}
                    className={`cursor-pointer transition-colors
                      ${isSelected ? "bg-violet-50 border-l-2 border-l-violet-500" : "bg-white hover:bg-gray-50"}`}
                  >
                    {/* Candidate */}
                    <td className="px-4 py-3 min-w-[160px] max-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGradient(email.from)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                          {sender.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{sender.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{sender.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-gray-500">{formatRelative(email.date)}</span>
                    </td>

                    {/* Subject */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-xs text-gray-700 truncate font-medium">{email.subject || "(No Subject)"}</p>
                    </td>

                    {/* AI Summary */}
                    <td className="px-4 py-3 max-w-[340px]">
                      <p className="text-[11px] text-gray-600 leading-relaxed">{email.summary}</p>
                      {hasKwMatch && (
                        <span className="inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
                          {mand}/{criteria.mandatory.length} req{opt > 0 ? ` +${opt} opt` : ""}
                        </span>
                      )}
                    </td>

                    {/* Match score */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {evalResult ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                          ${evalResult.matchScore >= 70 ? "bg-emerald-100 text-emerald-700"
                            : evalResult.matchScore >= 40 ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-600"}`}>
                          {evalResult.matchScore}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Recommendation */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {evalResult ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset
                          ${evalResult.recommendation === "Yes"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-red-50 text-red-600 ring-red-200"}`}>
                          {evalResult.recommendation === "Yes" ? "✓ Yes" : "✗ No"}
                        </span>
                      ) : evalState?.error ? (
                        <span className="text-[10px] text-red-400">Error</span>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Attachments */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(email.attachments?.length ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {email.attachments!.length}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Evaluate button */}
                    <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {isEvaluating ? (
                        <div className="flex items-center gap-1 text-[10px] text-violet-500">
                          <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                          Evaluating…
                        </div>
                      ) : (
                        <button
                          onClick={() => evaluate(email)}
                          disabled={!hasCriteria}
                          title={hasCriteria ? "Evaluate against job criteria" : "Set position & requirements first"}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ring-1 ring-violet-200"
                        >
                          {evalResult ? "Re-evaluate" : "Evaluate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Slide-over detail panel ──────────────────────────────────────── */}
      {selectedEmail && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 backdrop-blur-[1px]" onClick={() => setSelected(null)} />
          <DetailPanel
            email={selectedEmail}
            evalState={evaluations.get(selectedEmail.emailId) ?? null}
            detailTab={detailTab}
            onTabChange={setDetailTab}
            onClose={() => setSelected(null)}
            onEvaluate={() => evaluate(selectedEmail)}
            hasCriteria={hasCriteria}
            isLoadingDetail={loadingDetailId === selectedEmail.emailId}
          />
        </>
      )}
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
}

function DetailPanel({ email, evalState, detailTab, onTabChange, onClose, onEvaluate, hasCriteria, isLoadingDetail }: DetailPanelProps) {
  const sender = parseSender(email.from);
  const evaluated = evalState?.result ?? null;
  const candidateName = (evaluated?.candidateName && evaluated.candidateName !== "Unknown Candidate")
    ? evaluated.candidateName : sender.name;

  return (
    <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-40 flex flex-col overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1" />
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
                    <iframe srcDoc={email.htmlBody} sandbox=""
                      className="w-full bg-white" style={{ height: "480px", border: "none" }} title="Email content" />
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 max-h-96 overflow-y-auto">
                    <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words">{email.body}</pre>
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
