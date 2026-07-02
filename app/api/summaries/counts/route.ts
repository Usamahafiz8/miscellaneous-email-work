import { NextResponse } from "next/server";
import { getSummaryCounts } from "@/lib/cache";

// GET /api/summaries/counts — lightweight sidebar badge counts (total/unread/hiring)
// across the whole dataset, independent of whatever page a view has loaded.
export async function GET() {
  try {
    const counts = await getSummaryCounts();
    return NextResponse.json({ success: true, ...counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load counts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
