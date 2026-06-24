"use client";

import { useState } from "react";
import type { EmailSummary } from "@/lib/types";

interface SummaryCardProps {
  summary: EmailSummary;
}

const SENTIMENT_CONFIG = {
  positive: {
    border: "border-l-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-400",
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  neutral: {
    border: "border-l-gray-300",
    badge: "bg-gray-50 text-gray-600 ring-gray-200",
    dot: "bg-gray-400",
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
      </svg>
    ),
  },
  negative: {
    border: "border-l-red-400",
    badge: "bg-red-50 text-red-600 ring-red-200",
    dot: "bg-red-400",
    icon: (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M12 5a7 7 0 100 14A7 7 0 0012 5z" />
      </svg>
    ),
  },
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getInitials(from: string) {
  const name = from.replace(/<.*>/, "").trim();
  const parts = name.split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

function avatarColor(from: string) {
  let hash = 0;
  for (const c of from) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function SummaryCard({ summary }: SummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SENTIMENT_CONFIG[summary.sentiment ?? "neutral"];

  const senderName = summary.from.replace(/<.*>/, "").trim() || summary.from;
  const senderEmail = summary.from.match(/<(.+)>/)?.[1] ?? summary.from;

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${cfg.border} shadow-sm hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden`}
    >
      {/* Card header */}
      <div className="p-5 pb-3">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(summary.from)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
          >
            {getInitials(summary.from)}
          </div>

          {/* Sender + date */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{senderName}</p>
              <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(summary.date)}</span>
            </div>
            <p className="text-xs text-gray-400 truncate">{senderEmail}</p>
          </div>
        </div>

        {/* Subject */}
        <h3 className="mt-3 text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
          {summary.subject || "(No Subject)"}
        </h3>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gray-50" />

      {/* Summary body */}
      <div className="px-5 py-3 flex-1">
        <p className="text-sm text-gray-600 leading-relaxed">
          {expanded ? summary.summary : summary.summary.slice(0, 140) + (summary.summary.length > 140 ? "…" : "")}
        </p>

        {/* Key points */}
        {summary.keyPoints.length > 0 && expanded && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Key Points</p>
            <ul className="space-y-1">
              {summary.keyPoints.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50/60 flex items-center justify-between border-t border-gray-100">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${cfg.badge}`}
        >
          {cfg.icon}
          {summary.sentiment}
        </span>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-[#667eea] hover:text-[#764ba2] font-medium transition-colors"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      </div>
    </div>
  );
}
