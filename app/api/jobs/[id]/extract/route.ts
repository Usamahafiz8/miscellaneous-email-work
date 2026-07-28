import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJobDescription } from "@/lib/claude";
import { currentAccount } from "@/lib/session";

// LLM call to parse a job description — allow up to 5 minutes so it doesn't 504
// on the platform default (~15s). Vercel Pro; Hobby caps at 60s.
export const maxDuration = 300;

// POST /api/jobs/[id]/extract — parses the job's pasted jobDescription text via
// AI and fully overwrites the structured requirement fields with the result.
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

    if (!job.jobDescription?.trim()) {
      return NextResponse.json({ success: false, error: "No job description to extract from" }, { status: 400 });
    }

    const extracted = await parseJobDescription(job.jobDescription);
    if (!extracted) {
      return NextResponse.json({
        success: false,
        error: "Could not extract structured requirements — edit the fields manually below.",
      });
    }

    const updated = await prisma.jobPosting.update({
      where: { id: params.id },
      data: {
        minExperienceYears: extracted.minExperienceYears ?? null,
        maxExperienceYears: extracted.maxExperienceYears ?? null,
        techStack: extracted.techStack ?? [],
        requiredEmploymentStatus: extracted.requiredEmploymentStatus ?? null,
        requiredNoticePeriod: extracted.requiredNoticePeriod ?? null,
        requiredLocation: extracted.requiredLocation ?? null,
        requiredEmploymentType: extracted.requiredEmploymentType ?? null,
        otherCriteria: extracted.otherCriteria ?? null,
      },
    });

    return NextResponse.json({ success: true, job: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
