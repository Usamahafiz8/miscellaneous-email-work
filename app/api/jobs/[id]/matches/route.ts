import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentAccount } from "@/lib/session";

// GET /api/jobs/[id]/matches?threshold=N — candidate matches for this job,
// filtered to matchScore >= threshold (default 0), highest score first.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const job = await prisma.jobPosting.findFirst({ where: { id: params.id, account } });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const threshold = Number(searchParams.get("threshold")) || 0;

    const matches = await prisma.candidateMatch.findMany({
      where: { jobPostingId: params.id, matchScore: { gte: threshold } },
      orderBy: { matchScore: "desc" },
      include: {
        emailSummary: {
          select: {
            emailId: true, from: true, subject: true, date: true,
            candidateName: true, candidateRole: true, candidateExperience: true, candidateSkills: true,
            candidateEmploymentStatus: true, candidateNoticePeriod: true, candidateLocation: true, candidateEmploymentType: true,
            stage: true, tags: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, matches, total: matches.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load matches";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
