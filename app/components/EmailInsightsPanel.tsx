"use client";

import type { EmailSummary } from "@/lib/types";
import { parseSections } from "@/lib/parseSections";
import { isPresent } from "@/lib/utils";

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 10);
  // A short one-liner summary won't split into sentences — show it whole rather
  // than dropping it.
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

// A quiet section label — replaces the old coloured header bars, so a stack of
// sections reads as one calm list instead of several competing cards.
function SectionLabel({ icon, children }: { icon: JSX.Element; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
      <span className="text-gray-400">{icon}</span>
      {children}
    </p>
  );
}

// ── Structured PDF section labels → display config ─────────────────────────

const SECTION_CONFIG: Record<string, { icon: string; color: string }> = {
  "Document Type":       { icon: "📄", color: "text-amber-700" },
  "Name":                { icon: "👤", color: "text-indigo-700" },
  "Current Role":        { icon: "💼", color: "text-violet-700" },
  "Total Experience":    { icon: "🕐", color: "text-blue-700" },
  "Work History":        { icon: "🏢", color: "text-emerald-700" },
  "Technologies & Skills": { icon: "⚙️", color: "text-cyan-700" },
  "Education":           { icon: "🎓", color: "text-pink-700" },
  "Key Achievements":    { icon: "🏆", color: "text-orange-700" },
  "Other Details":       { icon: "📝", color: "text-gray-600" },
};

function WorkHistoryValue({ value }: { value: string }) {
  const entries = value.split(/,\s*(?=[A-Z])/);
  if (entries.length <= 1) return <span className="text-sm text-gray-800">{value}</span>;
  return (
    <ul className="space-y-1 mt-0.5">
      {entries.map((e, i) => (
        <li key={i} className="text-sm text-gray-800 flex items-start gap-1.5">
          <span className="text-emerald-500 mt-0.5">›</span>
          <span>{e.trim()}</span>
        </li>
      ))}
    </ul>
  );
}

function TechValue({ value }: { value: string }) {
  const tags = value.split(/[,;]\s*/).filter(Boolean);
  if (tags.length <= 1) return <span className="text-sm text-gray-800">{value}</span>;
  return (
    <div className="flex flex-wrap gap-1.5 mt-0.5">
      {tags.map((t, i) => (
        <span key={i} className="text-[11px] font-medium bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 px-2 py-0.5 rounded-full">
          {t.trim()}
        </span>
      ))}
    </div>
  );
}

function AttachmentSummaryPanel({ text }: { text: string }) {
  const sections = parseSections(text);

  return (
    <div className="rounded-xl border border-amber-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-100">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Attachment Summary</span>
      </div>

      {sections ? (
        <ul className="bg-white divide-y divide-amber-50/60">
          {sections.map(({ label, value }) => {
            const cfg = SECTION_CONFIG[label] ?? { icon: "•", color: "text-gray-600" };
            return (
              <li key={label} className="px-4 py-3 flex items-start gap-3">
                <span className="text-base flex-shrink-0 mt-0.5">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${cfg.color}`}>{label}</p>
                  {label === "Work History"
                    ? <WorkHistoryValue value={value} />
                    : label === "Technologies & Skills"
                    ? <TechValue value={value} />
                    : <p className="text-sm text-gray-800 leading-relaxed">{value}</p>
                  }
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="bg-white divide-y divide-amber-50">
          {splitSentences(text).map((sentence, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-2" />
              <span className="text-sm text-gray-700 leading-relaxed">{sentence}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  email: EmailSummary;
  /** Optional slot rendered between key highlights and PDF summary (e.g. evaluation result) */
  extra?: React.ReactNode;
}

export default function EmailInsightsPanel({ email, extra }: Props) {
  return (
    <div className="space-y-4 text-gray-700">
      {/* Summary — a plain numbered list, no card chrome. Priority/sentiment
          already show as badges in the pane header, so they aren't repeated
          here. */}
      {isPresent(email.summary) && (
        <section>
          <SectionLabel
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
          >
            Summary
          </SectionLabel>
          <ol className="mt-2 space-y-1.5">
            {splitSentences(email.summary).map((sentence, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                <span className="text-indigo-500 font-semibold tabular-nums flex-shrink-0">{i + 1}.</span>
                <span>{sentence}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Key points */}
      {email.keyPoints.length > 0 && (
        <section>
          <SectionLabel
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            }
          >
            Key Points
          </SectionLabel>
          <ul className="mt-2 space-y-1.5">
            {email.keyPoints.map((pt, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-800">{pt}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {extra}

      {/* PDF / Attachment Summary — kept as a card, it's the one genuinely
          structured block (parsed resume sections). */}
      {email.attachmentSummary && (
        <AttachmentSummaryPanel text={email.attachmentSummary} />
      )}

      {/* Purpose — one quiet line, not a card. */}
      {isPresent(email.purpose) && (
        <p className="flex items-baseline gap-2 pt-0.5 text-[13px]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex-shrink-0">Purpose</span>
          <span className="text-gray-700">{email.purpose}</span>
        </p>
      )}
    </div>
  );
}
