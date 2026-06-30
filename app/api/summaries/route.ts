import { NextRequest, NextResponse } from "next/server";
import { getCachedSummaries, clearCache } from "@/lib/cache";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 50), 100);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  try {
    const result = await getCachedSummaries(limit, offset);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch summaries";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/summaries — update a single email's status
export async function PATCH(request: NextRequest) {
  try {
    const { emailId, status } = await request.json() as { emailId: string; status: string };
    if (!emailId || !status) {
      return NextResponse.json({ success: false, error: "emailId and status are required" }, { status: 400 });
    }
    await prisma.emailSummary.update({ where: { emailId }, data: { status } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update status";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to clear cache";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
