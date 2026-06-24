import { NextRequest, NextResponse } from "next/server";
import { getCachedSummaries, clearCache } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 50), 100);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const result = await getCachedSummaries(limit, offset);
  return NextResponse.json(result);
}

export async function DELETE() {
  await clearCache();
  return NextResponse.json({ success: true, message: "All summaries deleted" });
}
