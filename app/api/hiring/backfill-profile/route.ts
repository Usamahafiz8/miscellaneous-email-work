import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractCandidateProfileFromBody } from "@/lib/claude";
import { parseSections } from "@/lib/parseSections";
import { currentAccount } from "@/lib/session";

// Allow up to 5 minutes — this loops one AI call per body-only candidate
export const maxDuration = 300;

// POST /api/hiring/backfill-profile — one-time backfill for the structured
// candidate columns (added for the Candidate Sheet) on already-cached Hiring
// emails. Two paths, cheapest first:
//  A) free regex re-parse of already-stored attachmentSummary labeled-line text
//  B) one AI call per remaining body-only candidate (no attachmentSummary at all)
// Fresh syncs going forward populate these columns directly (see buildBatchPrompt
// in lib/claude.ts) — this route only needs to run once against existing data.
export async function POST() {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const rows = await prisma.emailSummary.findMany({
      where: { account, category: "Hiring", candidateName: null },
      select: { emailId: true, subject: true, from: true, body: true, attachmentSummary: true },
    });

    let regexBackfilled = 0;
    let aiBackfilled = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        if (row.attachmentSummary) {
          const sections = parseSections(row.attachmentSummary);
          if (sections) {
            const get = (label: string) => sections.find((s) => s.label === label)?.value;
            const skillsRaw = get("Technologies & Skills");
            await prisma.emailSummary.update({
              where: { emailId: row.emailId },
              data: {
                candidateName: get("Name") ?? null,
                candidateRole: get("Current Role") ?? null,
                candidateExperience: get("Total Experience") ?? null,
                candidateSkills: skillsRaw ? skillsRaw.split(/[,;]\s*/).filter(Boolean) : [],
                candidateEducation: get("Education") ?? null,
                candidateAchievements: get("Key Achievements") ?? null,
              },
            });
            regexBackfilled++;
            continue;
          }
        }

        if (row.body) {
          const profile = await extractCandidateProfileFromBody(row.subject, row.from, row.body);
          if (profile) {
            await prisma.emailSummary.update({
              where: { emailId: row.emailId },
              data: {
                candidateName: profile.name ?? null,
                candidateRole: profile.role ?? null,
                candidateExperience: profile.experience ?? null,
                candidateSkills: profile.skills,
                candidateEducation: profile.education ?? null,
                candidateAchievements: profile.achievements ?? null,
              },
            });
            aiBackfilled++;
            continue;
          }
        }
        skipped++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ success: true, total: rows.length, regexBackfilled, aiBackfilled, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
