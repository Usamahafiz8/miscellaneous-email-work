import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchCandidateToJob } from "@/lib/claude";
import { currentAccount } from "@/lib/session";

// Allow up to 5 minutes — this loops one AI call per Hiring candidate.
export const maxDuration = 300;

// POST /api/jobs/[id]/scan — scores every Hiring-category candidate against
// this job's requirements and upserts a CandidateMatch row per candidate.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const job = await prisma.jobPosting.findFirst({ where: { id: params.id, account } });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const hasNoRequirements =
      job.techStack.length === 0 &&
      job.minExperienceYears == null &&
      job.maxExperienceYears == null &&
      !job.requiredEmploymentStatus &&
      !job.requiredNoticePeriod &&
      !job.requiredLocation &&
      !job.requiredEmploymentType &&
      !job.otherCriteria;

    if (hasNoRequirements) {
      return NextResponse.json(
        { success: false, error: "This job has no requirements set yet — extract or add requirements before scanning." },
        { status: 400 }
      );
    }

    const candidates = await prisma.emailSummary.findMany({
      where: { account, category: "Hiring" },
      select: {
        emailId: true, subject: true, summary: true, keyPoints: true,
        candidateName: true, candidateRole: true, candidateExperience: true, candidateSkills: true,
        candidateEmploymentStatus: true, candidateNoticePeriod: true, candidateLocation: true, candidateEmploymentType: true,
      },
    });

    const jobRequirements = {
      title: job.title,
      minExperienceYears: job.minExperienceYears ?? undefined,
      maxExperienceYears: job.maxExperienceYears ?? undefined,
      techStack: job.techStack,
      requiredEmploymentStatus: job.requiredEmploymentStatus ?? undefined,
      requiredNoticePeriod: job.requiredNoticePeriod ?? undefined,
      requiredLocation: job.requiredLocation ?? undefined,
      requiredEmploymentType: job.requiredEmploymentType ?? undefined,
      otherCriteria: job.otherCriteria ?? undefined,
    };

    let matched = 0;
    let skipped = 0;

    for (const c of candidates) {
      try {
        const result = await matchCandidateToJob(
          {
            candidateName: c.candidateName ?? undefined,
            candidateRole: c.candidateRole ?? undefined,
            candidateExperience: c.candidateExperience ?? undefined,
            candidateSkills: c.candidateSkills,
            candidateEmploymentStatus: c.candidateEmploymentStatus ?? undefined,
            candidateNoticePeriod: c.candidateNoticePeriod ?? undefined,
            candidateLocation: c.candidateLocation ?? undefined,
            candidateEmploymentType: c.candidateEmploymentType ?? undefined,
            subject: c.subject,
            summary: c.summary,
            keyPoints: c.keyPoints,
          },
          jobRequirements
        );

        if (!result) {
          skipped++;
          continue;
        }

        await prisma.candidateMatch.upsert({
          where: { jobPostingId_emailId: { jobPostingId: job.id, emailId: c.emailId } },
          update: { matchScore: result.matchScore, recommendation: result.recommendation, reasoning: result.reasoning, matchedAt: new Date() },
          create: { jobPostingId: job.id, emailId: c.emailId, matchScore: result.matchScore, recommendation: result.recommendation, reasoning: result.reasoning },
        });
        matched++;
      } catch {
        skipped++;
      }
    }

    await prisma.jobPosting.update({ where: { id: job.id }, data: { lastScannedAt: new Date() } });

    return NextResponse.json({ success: true, total: candidates.length, matched, skipped, scannedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
