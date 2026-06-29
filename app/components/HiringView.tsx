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
          <span key={tag} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 rounded-full px-2.5 py-1 font-medium">
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-red-500 ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
        />
        <button type="button" onClick={add} className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-gray-600 hover:bg-gray-200 transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-sky-600",
];

const CHIP_COLORS = [
  "bg-violet-50 text-violet-700 ring-violet-200",
  "bg-blue-50 text-blue-700 ring-blue-200",
  "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "bg-amber-50 text-amber-700 ring-amber-200",
  "bg-rose-50 text-rose-700 ring-rose-200",
  "bg-cyan-50 text-cyan-700 ring-cyan-200",
];

function avatarGradient(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function parseSender(from: string) {
  const name = from.replace(/<[^>]*>/g, "").trim();
  const m = from.match(/\(([^)]+)\)|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = from.includes("<") ? from.slice(from.indexOf("<") + 1, from.indexOf(">")) : (from.includes("@") ? from : "");
  const initials = (name || email).split(/\s+/).slice(0, 2).map(w => (w[0] || "").toUpperCase()).join("");
  return { name: name || email || from, email, initials };
}

function ScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={radius} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black" style={{ color }}>{score}%</span>
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
    <div className="flex flex-col h-full overflow-auto bg-[#f8fafc]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Hiring</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {summaries.length} candidate{summaries.length !== 1 ? "s" : ""} in inbox
            </p>
          </div>
          <button onClick={onFetch} disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 shadow-sm transition-opacity">
            {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isLoading ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
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
                <p className="text-xs text-gray-500">
                  {hasCriteria
                    ? `${criteria.position} · ${criteria.mandatory.length} requirement${criteria.mandatory.length !== 1 ? "s" : ""}`
                    : "Define requirements to evaluate candidates"}
                </p>
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
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Mandatory Requirements <span className="text-gray-400 font-normal">(press Enter)</span>
                </label>
                <TagInput value={criteria.mandatory} onChange={v => setCriteria(c => ({ ...c, mandatory: v }))} placeholder="e.g. 5+ years React experience" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nice to Have</label>
                <TagInput value={criteria.optional} onChange={v => setCriteria(c => ({ ...c, optional: v }))} placeholder="e.g. TypeScript, Node.js" />
              </div>
            </div>
          )}
        </div>

        {/* Candidate Cards */}
        {summaries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-500">No hiring emails found.</p>
            <p className="text-xs text-gray-400 mt-1">Sync your inbox — emails categorized as Hiring appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {summaries.map((email) => {
              const evalState = evaluations.get(email.emailId);
              const evaluated = evalState ? evalState.result : null;
              const sender = parseSender(email.from);
              const name = (evaluated && evaluated.candidateName && evaluated.candidateName !== "Unknown Candidate")
                ? evaluated.candidateName
                : sender.name;
              const emailAddr = sender.email;
              const gradient = avatarGradient(email.from);

              return (
                <div key={email.emailId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Candidate identity row */}
                  <div className="px-5 pt-5 pb-4 flex items-start gap-4">
                    {/* Avatar */}
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm`}>
                      {sender.initials}
                    </div>

                    {/* Name + email + subject */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-gray-900 leading-tight">{name}</h3>
                        {email.priority === "High" || email.priority === "Critical" ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 ring-1 ring-inset ring-red-200">
                            {email.priority}
                          </span>
                        ) : null}
                        {email.actionRequired === "Yes" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200">
                            Action Needed
                          </span>
                        )}
                      </div>
                      {emailAddr && <p className="text-xs text-gray-400 mt-0.5">{emailAddr}</p>}
                      <p className="text-xs text-indigo-500 font-medium mt-1 truncate">{email.subject || "(No Subject)"}</p>
                    </div>

                    {/* Evaluate button */}
                    <div className="flex-shrink-0">
                      {!evalState ? (
                        <button
                          onClick={() => evaluate(email)}
                          disabled={!hasCriteria}
                          title={hasCriteria ? "Evaluate this candidate" : "Set job criteria first"}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Evaluate
                        </button>
                      ) : evalState.loading ? (
                        <div className="flex items-center gap-1.5 px-3 py-2 text-violet-600 text-xs">
                          <div className="w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                          Evaluating…
                        </div>
                      ) : evalState.error ? (
                        <p className="text-xs text-red-500 max-w-[120px] text-right">{evalState.error}</p>
                      ) : null}
                    </div>
                  </div>

                  {/* AI Summary */}
                  <div className="px-5 pb-3">
                    <p className="text-sm text-gray-600 leading-relaxed">{email.summary}</p>
                  </div>

                  {/* Key Points as chips */}
                  {email.keyPoints.length > 0 && (
                    <div className="px-5 pb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Highlights</p>
                      <div className="flex flex-wrap gap-1.5">
                        {email.keyPoints.map((pt, i) => (
                          <span
                            key={i}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ring-1 ring-inset ${CHIP_COLORS[i % CHIP_COLORS.length]}`}
                          >
                            {pt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evaluation Result */}
                  {evaluated && (
                    <div className={`border-t px-5 py-4 flex items-start gap-4 ${evaluated.recommendation === "Yes" ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                      {/* Score ring */}
                      <ScoreRing score={evaluated.matchScore} />

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${evaluated.recommendation === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                            {evaluated.recommendation === "Yes" ? "✓ Recommended" : "✗ Not Recommended"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{evaluated.reasoning}</p>
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
