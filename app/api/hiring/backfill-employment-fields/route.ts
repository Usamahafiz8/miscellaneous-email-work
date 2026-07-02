import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractEmploymentDetails } from "@/lib/claude";

// Allow up to 5 minutes — this loops one AI call per candidate missing any of the 4 new fields
export const maxDuration = 300;

// POST /api/hiring/backfill-employment-fields — one-time backfill for the 4 new
// employment/logistics columns (candidateEmploymentStatus/candidateNoticePeriod/
// candidateLocation/candidateEmploymentType) on already-cached Hiring emails.
// Fresh syncs going forward populate these directly (see buildBatchPrompt in
// lib/claude.ts) — this route only needs to run once against existing data.
export async function POST() {
  try {
    const rows = await prisma.emailSummary.findMany({
      where: {
        category: "Hiring",
        OR: [
          { candidateEmploymentStatus: null }, { candidateNoticePeriod: null },
          { candidateLocation: null }, { candidateEmploymentType: null },
        ],
      },
      select: { emailId: true, subject: true, from: true, body: true, attachmentSummary: true },
    });

    let backfilled = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        const sourceText = row.attachmentSummary || row.body;
        if (!sourceText) { skipped++; continue; }
        const details = await extractEmploymentDetails(row.subject, row.from, sourceText);
        if (!details) { skipped++; continue; }
        await prisma.emailSummary.update({
          where: { emailId: row.emailId },
          data: {
            candidateEmploymentStatus: details.employmentStatus ?? null,
            candidateNoticePeriod: details.noticePeriod ?? null,
            candidateLocation: details.location ?? null,
            candidateEmploymentType: details.employmentType ?? null,
          },
        });
        backfilled++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ success: true, total: rows.length, backfilled, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
