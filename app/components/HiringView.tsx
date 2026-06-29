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

export default function HiringView({ summaries, isLoading, onFetch }: HiringViewProps) {
  const [criteria, setCriteria] = useState<HiringCriteria>({ position: "", mandatory: [], optional: [] });
  const [criteriaOpen, setCriteriaOpen] = useState(true);
  const [filterActive, setFilterActive] = useState(false);
  const [evaluations, setEvaluations] = useState<Map<string, EvalState>>(new Map());
  const [selected, setSelected] = useState<EmailSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"insights" | "email">("insights");

  const hasCriteria = !!(criteria.position.trim() && criteria.mandatory.length > 0);

  // Sorted + optionally filtered candidate list — keyword scoring done inline to avoid double-call
  const visibleCandidates = useMemo(() => {
    const getText = (e: EmailSummary) =>
      [e.summary, e.subject, ...e.keyPoints].join(" ").toLowerCase();

    const mandHits = (e: EmailSummary) =>
      hasCriteria ? criteria.mandatory.filter(r => getText(e).includes(r.toLowerCase())).length : 0;
    const optHits = (e: EmailSummary) =>
      hasCriteria ? criteria.optional.filter(r => getText(e).includes(r.toLowerCase())).length : 0;

    const scored = summaries.map(e => ({
      email: e,
      mand: mandHits(e),
      opt: optHits(e),
      eval: evaluations.get(e.emailId)?.result ?? null,
    }));

    scored.sort((a, b) => {
      if (a.eval && b.eval) return b.eval.matchScore - a.eval.matchScore;
      if (a.eval) return -1;
      if (b.eval) return 1;
      const relA = a.mand * 10 + a.opt;
      const relB = b.mand * 10 + b.opt;
      if (relA !== relB) return relB - relA;
      return new Date(b.email.date).getTime() - new Date(a.email.date).getTime();
    });

    const list = filterActive && hasCriteria
      ? scored.filter(s => s.eval ? s.eval.matchScore >= 30 : s.mand > 0)
      : scored;

    return list;
  }, [summaries, evaluations, criteria, filterActive, hasCriteria]);

  const selectedEmail = selected
    ? (summaries.find(s => s.emailId === selected.emailId) ?? selected)
    : null;

  function handleSelect(email: EmailSummary) {
    if (selected?.emailId === email.emailId) { setSelected(null); return; }
    setSelected(email);
    setDetailTab("insights");
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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Hiring</h1>
          <p className="text-xs text-gray-500 mt-0.5">{summaries.length} candidate{summaries.length !== 1 ? "s" : ""} in inbox</p>
        </div>
        <button onClick={onFetch} disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
          {isLoading
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          }
          <span className="hidden sm:inline">{isLoading ? "Syncing…" : "Refresh"}</span>
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: criteria + candidate list ──────────────────── */}
        <div className={`flex flex-col border-r border-gray-200 bg-[#f8fafc] overflow-hidden transition-all
          ${selectedEmail ? "hidden md:flex md:w-[300px] lg:w-[340px] flex-shrink-0" : "flex-1"}`}>

          {/* Job Criteria */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white">
            <button type="button" onClick={() => setCriteriaOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Job Criteria</p>
                  <p className="text-xs text-gray-500 truncate">
                    {hasCriteria ? `${criteria.position} · ${criteria.mandatory.length} req.` : "Set requirements first"}
                  </p>
                </div>
              </div>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${criteriaOpen ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {criteriaOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                <div className="pt-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Position</label>
                  <input value={criteria.position} onChange={e => setCriteria(c => ({ ...c, position: e.target.value }))}
                    placeholder="e.g. Senior React Developer"
                    className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Must Have <span className="text-gray-400 font-normal normal-case">(press Enter)</span>
                  </label>
                  <TagInput value={criteria.mandatory} onChange={v => setCriteria(c => ({ ...c, mandatory: v }))} placeholder="e.g. 5+ yrs React" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Nice to Have</label>
                  <TagInput value={criteria.optional} onChange={v => setCriteria(c => ({ ...c, optional: v }))} placeholder="e.g. TypeScript" />
                </div>
              </div>
            )}
          </div>

          {/* Candidate list header — filter toggle */}
          {summaries.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100 flex-shrink-0">
              <span className="text-[11px] text-gray-400">
                {hasCriteria
                  ? filterActive
                    ? `${visibleCandidates.length} of ${summaries.length} match`
                    : `${summaries.length} candidate${summaries.length !== 1 ? "s" : ""} · sorted by fit`
                  : `${summaries.length} candidate${summaries.length !== 1 ? "s" : ""}`}
              </span>
              {hasCriteria && (
                <button onClick={() => setFilterActive(f => !f)}
                  className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                    filterActive
                      ? "bg-violet-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600"
                  }`}>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4h18M6 8h12M9 12h6M11 16h2" />
                  </svg>
                  {filterActive ? "Matching only" : "Filter"}
                </button>
              )}
            </div>
          )}

          {/* Candidate list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {summaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3 px-6 text-center">
                <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">No hiring emails found</p>
                <button onClick={onFetch} className="text-sm font-medium text-violet-600 hover:text-violet-700">Sync inbox →</button>
              </div>
            ) : visibleCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2 px-6 text-center">
                <svg className="w-8 h-8 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm">No candidates match these criteria</p>
                <button onClick={() => setFilterActive(false)} className="text-xs font-medium text-violet-600 hover:text-violet-700">Show all →</button>
              </div>
            ) : (
              visibleCandidates.map(({ email, mand, opt, eval: result }) => {
                const sender = parseSender(email.from);
                const isSelected = selectedEmail?.emailId === email.emailId;
                const hasKwMatch = hasCriteria && !result && (mand > 0 || opt > 0);

                return (
                  <button key={email.emailId} onClick={() => handleSelect(email)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors border-l-2
                      ${isSelected ? "bg-violet-50 border-violet-500" : "bg-white hover:bg-gray-50 border-transparent"}`}>
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarGradient(email.from)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>
                      {sender.initials}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className="text-sm font-semibold text-gray-900 truncate">{sender.name}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{formatRelative(email.date)}</span>
                      </div>

                      {/* Sender email */}
                      {sender.email && (
                        <p className="text-[11px] text-gray-400 truncate mb-1">{sender.email}</p>
                      )}

                      {/* Subject */}
                      <p className="text-xs font-medium text-gray-600 truncate mb-2">{email.subject || "(No Subject)"}</p>

                      {/* AI Summary — up to 3 lines */}
                      <p className="text-[11px] text-gray-500 line-clamp-3 leading-relaxed mb-2">{email.summary}</p>

                      {/* Key points as chips */}
                      {email.keyPoints.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {email.keyPoints.slice(0, 4).map((pt, i) => (
                            <span key={i} className="text-[10px] bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-medium max-w-[150px] truncate">
                              {pt}
                            </span>
                          ))}
                          {email.keyPoints.length > 4 && (
                            <span className="text-[10px] text-gray-400 py-0.5">+{email.keyPoints.length - 4} more</span>
                          )}
                        </div>
                      )}

                      {/* PDF summary indicator */}
                      {email.attachmentSummary && (
                        <p className="text-[10px] text-amber-600 font-medium mb-1.5 flex items-center gap-1">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          PDF summary available
                        </p>
                      )}

                      {/* Tags row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {result ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            result.recommendation === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                          }`}>
                            {result.matchScore}% match
                          </span>
                        ) : null}
                        {hasKwMatch ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
                            {mand}/{criteria.mandatory.length} req{opt > 0 ? ` +${opt}` : ""}
                          </span>
                        ) : null}
                        {hasCriteria && !result && !hasKwMatch ? (
                          <span className="text-[10px] text-gray-300">no keyword match</span>
                        ) : null}
                        {email.priority === "High" || email.priority === "Critical"
                          ? <span className="text-[10px] font-semibold text-red-500">{email.priority}</span>
                          : null}
                        {email.actionRequired === "Yes"
                          ? <span className="text-[10px] font-semibold text-amber-600">⚡ Action</span>
                          : null}
                        {(email.attachments?.length ?? 0) > 0
                          ? <span className="text-[10px] text-gray-400">📎 {email.attachments!.length}</span>
                          : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right panel: detail ─────────────────────────────────────── */}
        {selectedEmail ? (
          <DetailPanel
            email={selectedEmail}
            evalState={evaluations.get(selectedEmail.emailId) ?? null}
            detailTab={detailTab}
            onTabChange={setDetailTab}
            onBack={() => setSelected(null)}
            onEvaluate={() => evaluate(selectedEmail)}
            hasCriteria={hasCriteria}
          />
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center text-gray-300 bg-gray-50 select-none">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-400">Select a candidate to review</p>
            <p className="text-xs text-gray-300 mt-1">AI insights, email body, and PDF summary all in one place</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail panel (extracted to avoid IIFE) ─────────────────────────────────

interface DetailPanelProps {
  email: EmailSummary;
  evalState: EvalState | null;
  detailTab: "insights" | "email";
  onTabChange: (tab: "insights" | "email") => void;
  onBack: () => void;
  onEvaluate: () => void;
  hasCriteria: boolean;
}

function DetailPanel({ email, evalState, detailTab, onTabChange, onBack, onEvaluate, hasCriteria }: DetailPanelProps) {
  const sender = parseSender(email.from);
  const evaluated = evalState?.result ?? null;
  const candidateName = (evaluated?.candidateName && evaluated.candidateName !== "Unknown Candidate")
    ? evaluated.candidateName : sender.name;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white absolute inset-0 md:static md:inset-auto">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="md:hidden text-xs">Back</span>
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
          <button onClick={onEvaluate}
            className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">Re-evaluate</button>
        ) : null}
      </div>

      {/* Candidate header */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarGradient(email.from)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm`}>
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
            <div className="flex flex-wrap gap-1.5 mt-2.5">
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

        {/* Evaluation result bar */}
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
      <div className="flex border-b border-gray-200 px-4 sm:px-6 bg-white flex-shrink-0">
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
        <div className="px-4 sm:px-6 py-5 max-w-2xl mx-auto space-y-4">

          {detailTab === "insights" && <EmailInsightsPanel email={email} />}

          {detailTab === "email" && (
            <>
              {(email.htmlBody || email.body) ? (
                email.htmlBody ? (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <iframe srcDoc={email.htmlBody} sandbox=""
                      className="w-full bg-white" style={{ height: "500px", border: "none" }} title="Email content" />
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 max-h-96 overflow-y-auto">
                    <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words">
                      {email.body}
                    </pre>
                  </div>
                )
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
