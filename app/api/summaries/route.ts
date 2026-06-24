import { NextRequest, NextResponse } from "next/server";
import { getCachedSummaries, clearCache, getCacheAge } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 20), 100);
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const result = getCachedSummaries(limit, offset);
  const cacheAge = getCacheAge();

  return NextResponse.json({
    ...result,
    cacheAge,
  });
}

export async function DELETE() {
  clearCache();
  return NextResponse.json({ success: true, message: "Cache cleared" });
}
