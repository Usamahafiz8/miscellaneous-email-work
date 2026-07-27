import { NextResponse } from "next/server";
import { summarizeEmails } from "@/lib/claude";
import { cacheSummaries, getPendingEmails, countPendingSummaries } from "@/lib/cache";
import { currentAccount } from "@/lib/session";
import type { SummaryLength } from "@/lib/types";

// Batch LLM summarization of pending emails — allow up to 5 minutes so a batch
// doesn't 504 on the platform default. Vercel Pro; Hobby caps at 60s.
export const maxDuration = 300;

// How many pending emails to summarize per call; the client loops until
// remaining hits 0. Sized to exactly one concurrency wave inside
// summarizeEmails (CHUNK_SIZE 8 × 3 chunks, all in flight at once under a pool
// of 6) so the request's wall-clock is ~one chunk regardless of BATCH — 2.4×
// the emails per call as the old sequential 10, in *less* time. Raising this
// past one wave brings back the old sum-of-chunks behaviour and the 504 risk.
const BATCH = 24;

// POST /api/email/summarize-pending
// Summarizes up to BATCH raw (summarized=false) emails for the signed-in account
// using their stored body/attachments — no IMAP needed. Returns how many it did
// and how many still remain, so the client can loop with a progress indicator.
export async function POST() {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const summaryLength = (["short", "medium", "long"].includes(process.env.SUMMARY_LENGTH ?? "")
    ? process.env.SUMMARY_LENGTH
    : "medium") as SummaryLength;

  try {
    const pending = await getPendingEmails(account, BATCH);

    if (pending.length === 0) {
      return NextResponse.json({ success: true, summarized: 0, remaining: 0 });
    }

    const summaries = await summarizeEmails(pending, summaryLength);
    await cacheSummaries(summaries, account);

    const remaining = await countPendingSummaries(account);
    return NextResponse.json({ success: true, summarized: summaries.length, remaining });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to summarize pending emails";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
