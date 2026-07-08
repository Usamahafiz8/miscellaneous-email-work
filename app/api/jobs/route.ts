import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentAccount } from "@/lib/session";

// GET /api/jobs — list this account's job postings, most recently updated first.
export async function GET() {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const jobs = await prisma.jobPosting.findMany({
      where: { account },
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
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

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
      data: { account, title: title.trim(), jobDescription: jobDescription?.trim() || null },
    });
    return NextResponse.json({ success: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create job";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
