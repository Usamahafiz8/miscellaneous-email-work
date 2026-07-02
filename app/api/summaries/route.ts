import { NextRequest, NextResponse } from "next/server";
import { getCachedSummaries, clearCache } from "@/lib/cache";
import { parseEmailListQuery } from "@/lib/queryParams";
import { prisma } from "@/lib/db";
import { STATUSES, STAGES } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = parseEmailListQuery(searchParams);

  try {
    const result = await getCachedSummaries(query);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch summaries";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/summaries — update a single email's status, stage, and/or tags
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { emailId: string; status?: string; stage?: string; tags?: string[] };
    const { emailId, status, stage, tags } = body;
    if (!emailId) {
      return NextResponse.json({ success: false, error: "emailId is required" }, { status: 400 });
    }

    const data: { status?: string; stage?: string; tags?: string[] } = {};
    if (status !== undefined) {
      if (!(STATUSES as string[]).includes(status)) {
        return NextResponse.json({ success: false, error: `Invalid status: ${status}` }, { status: 400 });
      }
      data.status = status;
    }
    if (stage !== undefined) {
      if (!(STAGES as string[]).includes(stage)) {
        return NextResponse.json({ success: false, error: `Invalid stage: ${stage}` }, { status: 400 });
      }
      data.stage = stage;
    }
    if (tags !== undefined) {
      data.tags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, 20);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    await prisma.emailSummary.update({ where: { emailId }, data });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update email";
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
