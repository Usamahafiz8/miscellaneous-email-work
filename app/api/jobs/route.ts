import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/jobs — list all job postings, most recently updated first.
export async function GET() {
  try {
    const jobs = await prisma.jobPosting.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { matches: true } } },
    });
    return NextResponse.json({ success: true, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load jobs";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/jobs — create a new job posting.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { title, jobDescription } = body as { title?: string; jobDescription?: string };
  if (!title?.trim()) {
    return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });
  }
  try {
    const job = await prisma.jobPosting.create({
      data: { title: title.trim(), jobDescription: jobDescription?.trim() || null },
    });
    return NextResponse.json({ success: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create job";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
