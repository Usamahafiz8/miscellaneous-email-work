"use client";

import { useState } from "react";
import type { EmailSummary, HiringCriteria, CandidateEvaluation } from "@/lib/types";

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
        {value.map((tag) => (
          <span key={tag} className="flex items-center gap-1 text-xs bg-[#667eea]/10 text-[#667eea] rounded-full px-2.5 py-1 font-medium">
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-red-500">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]"
        />
        <button type="button" onClick={add} className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-gray-600 hover:bg-gray-200 transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

export default function HiringView({ summaries, isLoading, onFetch }: HiringViewProps) {
  const [criteria, setCriteria] = useState<HiringCriteria>({ position: "", mandatory: [], optional: [] });
  const [criteriaOpen, setCriteriaOpen] = useState(true);
  const [evaluations, setEvaluations] = useState<Map<string, EvalState>>(new Map());

  const hasCriteria = criteria.position.trim() && criteria.mandatory.length > 0;

  async function evaluate(email: EmailSummary) {
    if (!hasCriteria) return;
    setEvaluations(prev => new Map(prev).set(email.emailId, { loading: true, result: null, error: null }));
    try {
      const res = await fetch("/api/hiring/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: email.summary, keyPoints: email.keyPoints, subject: email.subject, criteria }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Evaluation failed");
      setEvaluations(prev => new Map(prev).set(email.emailId, { loading: false, result: data.evaluation, error: null }));
    } catch (err) {
      setEvaluations(prev => new Map(prev).set(email.emailId, {
        loading: false, result: null,
        error: err instanceof Error ? err.message : "Failed",
      }));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#f8fafc]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Hiring</h1>
            <p className="text-sm text-gray-500 mt-0.5">{summaries.length} candidate email{summaries.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onFetch} disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 shadow-sm transition-opacity">
            {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
            {isLoading ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Job Criteria Panel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setCriteriaOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 text-sm">Job Criteria</p>
                <p className="text-xs text-gray-500">{hasCriteria ? `${criteria.position} · ${criteria.mandatory.length} mandatory requirements` : "Define requirements to evaluate candidates"}</p>
              </div>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${criteriaOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {criteriaOpen && (
            <div className="px-6 pb-6 border-t border-gray-50 pt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Position Title</label>
                <input
                  value={criteria.position}
                  onChange={e => setCriteria(c => ({ ...c, position: e.target.value }))}
                  placeholder="e.g. Senior React Developer"
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#667eea]/20 focus:border-[#667eea]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandatory Requirements <span className="text-gray-400 font-normal">(press Enter to add)</span></label>
                <TagInput value={criteria.mandatory} onChange={v => setCriteria(c => ({ ...c, mandatory: v }))} placeholder="e.g. 5+ years React experience" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Optional (Nice to Have)</label>
                <TagInput value={criteria.optional} onChange={v => setCriteria(c => ({ ...c, optional: v }))} placeholder="e.g. TypeScript, Node.js" />
              </div>
            </div>
          )}
        </div>

        {/* Candidates */}
        {summaries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-500">No hiring emails found in the synced emails.</p>
            <p className="text-xs text-gray-400 mt-1">Sync your inbox — emails categorized as Hiring will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {summaries.map((email) => {
              const evalState = evaluations.get(email.emailId);
              const evaluated = evalState?.result;

              return (
                <div key={email.emailId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-5 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm">{email.subject || "(No Subject)"}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ring-inset ${email.priority === "Critical" || email.priority === "High" ? "bg-red-50 text-red-600 ring-red-200" : "bg-gray-100 text-gray-500 ring-gray-200"}`}>
                          {email.priority}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{email.from}</p>
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed">{email.summary}</p>
                      {email.keyPoints.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {email.keyPoints.map((pt, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                              <span className="mt-1.5 w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
                              {pt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Evaluate button / result */}
                    <div className="flex-shrink-0 min-w-[140px]">
                      {!evalState ? (
                        <button
                          onClick={() => evaluate(email)}
                          disabled={!hasCriteria}
                          title={hasCriteria ? "Evaluate this candidate" : "Set job criteria first"}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Evaluate
                        </button>
                      ) : evalState.loading ? (
                        <div className="flex items-center justify-center gap-2 py-2 text-violet-600 text-xs">
                          <div className="w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                          Evaluating…
                        </div>
                      ) : evalState.error ? (
                        <p className="text-xs text-red-500 text-center">{evalState.error}</p>
                      ) : null}
                    </div>
                  </div>

                  {/* Evaluation result */}
                  {evaluated && (
                    <div className={`border-t px-5 py-4 ${evaluated.recommendation === "Yes" ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                      <div className="flex items-start gap-4 flex-wrap">
                        <div className="text-center">
                          <div className={`text-3xl font-black ${evaluated.matchScore >= 70 ? "text-emerald-600" : evaluated.matchScore >= 40 ? "text-amber-500" : "text-red-500"}`}>
                            {evaluated.matchScore}%
                          </div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Match Score</p>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-black ${evaluated.recommendation === "Yes" ? "text-emerald-600" : "text-red-500"}`}>
                            {evaluated.recommendation}
                          </div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Recommend</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          {evaluated.candidateName && evaluated.candidateName !== "Unknown Candidate" && (
                            <p className="text-sm font-semibold text-gray-800 mb-1">{evaluated.candidateName}</p>
                          )}
                          <p className="text-xs text-gray-600 leading-relaxed">{evaluated.reasoning}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
