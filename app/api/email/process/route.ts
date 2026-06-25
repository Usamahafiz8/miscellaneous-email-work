import { NextRequest, NextResponse } from "next/server";
import { fetchEmails } from "@/lib/imap";
import { summarizeEmails } from "@/lib/claude";
import { cacheSummaries, getCachedSummaries, getExistingEmailIds, getSummariesByIds } from "@/lib/cache";
import type { SummaryLength } from "@/lib/types";

const PAGE_SIZE = 50;

// Load emails from DB only — no IMAP, no AI calls
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  try {
    const { summaries, total } = await getCachedSummaries(PAGE_SIZE, offset);
    return NextResponse.json({
      success: true,
      summaries,
      emailCount: summaries.length,
      totalCount: total,
      offset,
      fromCache: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load from database";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Sync from IMAP — runs AI only for emails not already in DB
export async function POST(request: NextRequest) {
  const config = {
    email: process.env.EMAIL_ADDRESS ?? "",
    password: process.env.EMAIL_PASSWORD ?? "",
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
  };

  if (!config.email || !config.password || !config.host) {
    return NextResponse.json(
      { success: false, error: "Email credentials not configured in .env.local" },
      { status: 500 }
    );
  }

  const summaryLength = (["short", "medium", "long"].includes(
    process.env.SUMMARY_LENGTH ?? ""
  )
    ? process.env.SUMMARY_LENGTH
    : "medium") as SummaryLength;

  const body = await request.json().catch(() => ({}));
  const offset = Math.max(0, Number(body.offset ?? 0));

  try {
    const { emails, totalCount } = await fetchEmails(config, PAGE_SIZE, offset);

    if (emails.length === 0) {
      return NextResponse.json({ success: true, summaries: [], emailCount: 0, totalCount, offset });
    }

    // Check DB for which emails are already summarized
    const existingIds = await getExistingEmailIds(emails.map((e) => e.id));
    const newEmails = emails.filter((e) => !existingIds.has(e.id));

    if (newEmails.length > 0) {
      const newSummaries = await summarizeEmails(newEmails, summaryLength);
      await cacheSummaries(newSummaries);
    }

    // Return summaries for this full page from DB
    const summaries = await getSummariesByIds(emails.map((e) => e.id));

    return NextResponse.json({
      success: true,
      summaries,
      emailCount: summaries.length,
      newCount: newEmails.length,
      totalCount,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
