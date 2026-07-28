import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentAccount } from "@/lib/session";

// GET /api/jobs/[id] — a single job posting (must belong to the signed-in account).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const job = await prisma.jobPosting.findFirst({ where: { id: params.id, account } });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load job";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/jobs/[id] — partial update of a job posting's fields.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const existing = await prisma.jobPosting.findFirst({ where: { id: params.id, account } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const body = await request.json() as {
      title?: string;
      jobDescription?: string | null;
      minExperienceYears?: number | null;
      maxExperienceYears?: number | null;
      techStack?: string[];
      requiredEmploymentStatus?: string | null;
      requiredNoticePeriod?: string | null;
      requiredLocation?: string | null;
      requiredEmploymentType?: string | null;
      otherCriteria?: string | null;
    };

    const {
      title, jobDescription, minExperienceYears, maxExperienceYears,
      techStack, requiredEmploymentStatus, requiredNoticePeriod,
      requiredLocation, requiredEmploymentType, otherCriteria,
    } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (jobDescription !== undefined) data.jobDescription = jobDescription;
    if (minExperienceYears !== undefined) data.minExperienceYears = minExperienceYears;
    if (maxExperienceYears !== undefined) data.maxExperienceYears = maxExperienceYears;
    if (techStack !== undefined) data.techStack = techStack;
    if (requiredEmploymentStatus !== undefined) data.requiredEmploymentStatus = requiredEmploymentStatus;
    if (requiredNoticePeriod !== undefined) data.requiredNoticePeriod = requiredNoticePeriod;
    if (requiredLocation !== undefined) data.requiredLocation = requiredLocation;
    if (requiredEmploymentType !== undefined) data.requiredEmploymentType = requiredEmploymentType;
    if (otherCriteria !== undefined) data.otherCriteria = otherCriteria;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    const job = await prisma.jobPosting.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update job";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/jobs/[id] — deletes a job posting; cascades to its CandidateMatch rows.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const existing = await prisma.jobPosting.findFirst({ where: { id: params.id, account } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }
    await prisma.jobPosting.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete job";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
