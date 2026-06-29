"use client";

import { useState, useEffect, useRef } from "react";
import type { EmailSummary, HiringCriteria, CandidateEvaluation, EmailAttachment } from "@/lib/types";

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

// ─── helpers ────────────────────────────────────────────────────────────────

function parseSender(from: string) {
  const name = from.replace(/<[^>]*>/g, "").replace(/"/g, "").trim();
  const email = from.includes("<") ? from.slice(from.indexOf("<") + 1, from.lastIndexOf(">")) : (from.includes("@") ? from : "");
  const display = name || email || from;
  const parts = display.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : display.slice(0, 2).toUpperCase();
  return { name: display, email, initials };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

function formatRelative(iso: string) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

const GRADIENTS = [
  "from-violet-500 to-purple-600", "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600", "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600", "from-cyan-500 to-sky-600",
];
function gradient(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return GRADIENTS[h % GRADIENTS.length];
}

const CHIP_COLORS = [
  "bg-violet-50 text-violet-700 ring-violet-200",
  "bg-blue-50 text-blue-700 ring-blue-200",
  "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "bg-amber-50 text-amber-700 ring-amber-200",
  "bg-rose-50 text-rose-700 ring-rose-200",
  "bg-cyan-50 text-cyan-700 ring-cyan-200",
];

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

// ─── PDF viewer ──────────────────────────────────────────────────────────────

function PdfViewer({ attachment }: { attachment: EmailAttachment }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  useEffect(() => {
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    const bytes = Uint8Array.from(atob(attachment.data), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    prevUrl.current = url;
    return () => URL.revokeObjectURL(url);
  }, [attachment.data]);
  if (!blobUrl) return null;
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z" />
          </svg>
          <span className="text-xs font-medium text-gray-700 truncate">{attachment.filename}</span>
          <span className="text-[10px] text-gray-400 flex-shrink-0">({(attachment.size / 1024).toFixed(0)} KB)</span>
        </div>
        <a href={blobUrl} download={attachment.filename}
          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex-shrink-0 ml-2">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </a>
      </div>
      <embed src={blobUrl} type="application/pdf" className="w-full" style={{ height: "460px" }} />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function HiringView({ summaries, isLoading, onFetch }: HiringViewProps) {
  const [criteria, setCriteria] = useState<HiringCriteria>({ position: "", mandatory: [], optional: [] });
  const [criteriaOpen, setCriteriaOpen] = useState(true);
  const [evaluations, setEvaluations] = useState<Map<string, EvalState>>(new Map());
  const [selected, setSelected] = useState<EmailSummary | null>(null);
  const [detailTab, setDetailTab] = useState<"insights" | "email">("insights");

  const hasCriteria = !!(criteria.position.trim() && criteria.mandatory.length > 0);

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
            ) : (
              summaries.map(email => {
                const sender = parseSender(email.from);
                const evalState = evaluations.get(email.emailId);
                const result = evalState ? evalState.result : null;
                const isSelected = selectedEmail?.emailId === email.emailId;

                return (
                  <button key={email.emailId} onClick={() => handleSelect(email)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors border-l-2
                      ${isSelected ? "bg-violet-50 border-violet-500" : "bg-white hover:bg-gray-50 border-transparent"}`}>
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient(email.from)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>
                      {sender.initials}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className="text-sm font-semibold text-gray-900 truncate">{sender.name}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{formatRelative(email.date)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mb-1">{email.subject || "(No Subject)"}</p>
                      <p className="text-[11px] text-gray-400 line-clamp-1">{email.summary}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {email.priority === "High" || email.priority === "Critical"
                          ? <span className="text-[10px] font-semibold text-red-500">{email.priority}</span>
                          : null}
                        {email.actionRequired === "Yes"
                          ? <span className="text-[10px] font-semibold text-amber-600">⚡ Action</span>
                          : null}
                        {result
                          ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${result.recommendation === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                              {result.matchScore}% match
                            </span>
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
        {selectedEmail ? (() => {
          const sender = parseSender(selectedEmail.from);
          const evalState = evaluations.get(selectedEmail.emailId);
          const evaluated = evalState ? evalState.result : null;
          const candidateName = (evaluated && evaluated.candidateName && evaluated.candidateName !== "Unknown Candidate")
            ? evaluated.candidateName : sender.name;

          return (
            <div className="flex-1 flex flex-col overflow-hidden bg-white absolute inset-0 md:static md:inset-auto">

              {/* Detail toolbar */}
              <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 flex-shrink-0">
                <button onClick={() => setSelected(null)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="md:hidden text-xs">Back</span>
                </button>
                <div className="flex-1" />
                {/* Evaluate button */}
                {!evalState ? (
                  <button onClick={() => evaluate(selectedEmail)} disabled={!hasCriteria}
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
                  <button onClick={() => evaluate(selectedEmail)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors">Re-evaluate</button>
                ) : null}
              </div>

              {/* Candidate header */}
              <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient(selectedEmail.from)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm`}>
                    {sender.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h2 className="text-base font-bold text-gray-900 leading-tight">{candidateName}</h2>
                        {sender.email && <p className="text-xs text-gray-400 mt-0.5">{sender.email}</p>}
                        <p className="text-xs font-medium text-violet-500 mt-1 truncate">{selectedEmail.subject || "(No Subject)"}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(selectedEmail.date)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset
                        ${selectedEmail.priority === "Critical" ? "bg-red-50 text-red-600 ring-red-200"
                          : selectedEmail.priority === "High" ? "bg-orange-50 text-orange-600 ring-orange-200"
                          : selectedEmail.priority === "Medium" ? "bg-yellow-50 text-yellow-700 ring-yellow-200"
                          : "bg-green-50 text-green-700 ring-green-200"}`}>
                        {selectedEmail.priority}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset capitalize
                        ${selectedEmail.sentiment === "positive" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : selectedEmail.sentiment === "negative" ? "bg-red-50 text-red-600 ring-red-200"
                          : "bg-gray-100 text-gray-600 ring-gray-200"}`}>
                        {selectedEmail.sentiment}
                      </span>
                      {selectedEmail.actionRequired === "Yes" && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset bg-red-50 text-red-600 ring-red-200">Action Required</span>
                      )}
                      {(selectedEmail.attachments?.length ?? 0) > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset bg-gray-100 text-gray-600 ring-gray-200">
                          {selectedEmail.attachments!.length} PDF attachment{selectedEmail.attachments!.length > 1 ? "s" : ""}
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
                  <button key={tab} onClick={() => setDetailTab(tab)}
                    className={`mr-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors
                      ${detailTab === tab ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    {tab === "insights" ? "AI Insights" : "Email"}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 sm:px-6 py-5 max-w-2xl mx-auto space-y-4">

                  {detailTab === "insights" && (
                    <>
                      {/* AI Summary */}
                      <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">AI Summary</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{selectedEmail.summary}</p>
                      </div>

                      {/* Key Points */}
                      {selectedEmail.keyPoints.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Highlights</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedEmail.keyPoints.map((pt, i) => (
                              <span key={i} className={`text-xs px-3 py-1.5 rounded-full font-medium ring-1 ring-inset ${CHIP_COLORS[i % CHIP_COLORS.length]}`}>
                                {pt}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PDF Attachment Summary */}
                      {selectedEmail.attachmentSummary && (
                        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                          <div className="flex items-center gap-2 mb-3">
                            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">PDF / Attachment Summary</span>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedEmail.attachmentSummary}</p>
                        </div>
                      )}

                      {/* Purpose & Sentiment */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-xl p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Purpose</p>
                          <p className="text-sm font-semibold text-gray-800">{selectedEmail.purpose}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Sentiment</p>
                          <p className={`text-sm font-semibold capitalize
                            ${selectedEmail.sentiment === "positive" ? "text-emerald-600"
                              : selectedEmail.sentiment === "negative" ? "text-red-500"
                              : "text-gray-600"}`}>
                            {selectedEmail.sentiment}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {detailTab === "email" && (
                    <>
                      {(selectedEmail.htmlBody || selectedEmail.body) ? (
                        selectedEmail.htmlBody ? (
                          <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <iframe srcDoc={selectedEmail.htmlBody} sandbox="allow-same-origin"
                              className="w-full bg-white" style={{ height: "500px", border: "none" }} title="Email content" />
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 max-h-96 overflow-y-auto">
                            <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans break-words">
                              {selectedEmail.body}
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

                      {/* PDF Attachments */}
                      {(selectedEmail.attachments?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                            Attachments ({selectedEmail.attachments!.length})
                          </p>
                          <div className="space-y-3">
                            {selectedEmail.attachments!.map((att, i) => (
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
        })() : (
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
