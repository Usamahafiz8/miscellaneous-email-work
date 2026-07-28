import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractPdfText } from "@/lib/pdf";
import { summarizePdfAttachment } from "@/lib/claude";
import { currentAccount } from "@/lib/session";
import type { EmailAttachment } from "@/lib/types";

// PDF text extraction + an LLM call per attachment across many emails — allow up
// to 5 minutes so it doesn't 504. Vercel Pro; Hobby caps at 60s.
export const maxDuration = 300;

// POST /api/email/pdf-summaries
// Reads existing emails from DB, extracts PDF text, generates attachmentSummary — no IMAP needed
export async function POST() {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Load this account's emails that have attachments stored
    const rows = await prisma.emailSummary.findMany({
      where: { account, attachments: { not: null } },
      select: { emailId: true, subject: true, from: true, attachments: true },
    });

    const withPdf = rows.filter((row) => {
      if (!row.attachments) return false;
      try {
        const atts: EmailAttachment[] = JSON.parse(row.attachments);
        return atts.some(
          (a) =>
            a.contentType?.toLowerCase().includes("pdf") ||
            a.filename?.toLowerCase().endsWith(".pdf")
        );
      } catch { return false; }
    });

    if (withPdf.length === 0) {
      return NextResponse.json({ success: true, processed: 0, total: 0 });
    }

    let processed = 0;

    // Process each email sequentially to avoid hammering the AI API
    for (const row of withPdf) {
      try {
        const atts: EmailAttachment[] = JSON.parse(row.attachments!);
        const pdfAtts = atts.filter(
          (a) =>
            a.contentType?.toLowerCase().includes("pdf") ||
            a.filename?.toLowerCase().endsWith(".pdf")
        );

        const texts = await Promise.all(
          pdfAtts.map((a) => extractPdfText(a.data).catch(() => ""))
        );
        const nonEmpty = texts.filter(Boolean);
        if (!nonEmpty.length) continue;

        const summary = await summarizePdfAttachment(row.subject, row.from, nonEmpty);
        if (!summary) continue;

        await prisma.emailSummary.update({
          where: { emailId: row.emailId },
          data: { attachmentSummary: summary },
        });

        processed++;
      } catch {
        // skip individual failures, continue with others
      }
    }

    return NextResponse.json({ success: true, processed, total: withPdf.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
