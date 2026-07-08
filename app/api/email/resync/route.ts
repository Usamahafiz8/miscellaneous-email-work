import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { summarizeEmails } from "@/lib/claude";
import { cacheSummaries } from "@/lib/cache";
import { currentAccount } from "@/lib/session";
import type { SummaryLength } from "@/lib/types";

// POST /api/email/resync
// Re-runs AI summarization on a single already-cached email — no IMAP needed.
// body: { emailId: string }
export async function POST(request: NextRequest) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const emailId = (body as Record<string, unknown>).emailId;
  if (typeof emailId !== "string" || !emailId) {
    return NextResponse.json({ success: false, error: "emailId is required" }, { status: 400 });
  }

  const row = await prisma.emailSummary.findFirst({ where: { emailId, account } });
  if (!row) {
    return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });
  }

  const summaryLength = (["short", "medium", "long"].includes(process.env.SUMMARY_LENGTH ?? "")
    ? process.env.SUMMARY_LENGTH
    : "medium") as SummaryLength;

  try {
    const email = {
      id: row.emailId,
      from: row.from,
      subject: row.subject,
      date: row.date,
      fullText: row.body ?? "",
      htmlBody: row.htmlBody ?? undefined,
      attachments: row.attachments
        ? (() => { try { return JSON.parse(row.attachments!); } catch { return undefined; } })()
        : undefined,
    };

    const [summary] = await summarizeEmails([email], summaryLength);
    await cacheSummaries([{ ...summary, status: (row.status as "New" | "Open" | "Closed") ?? "New" }], account);

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Re-processing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
