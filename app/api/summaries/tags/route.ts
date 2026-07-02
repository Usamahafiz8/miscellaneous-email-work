import { NextResponse } from "next/server";
import { getDistinctTags } from "@/lib/cache";

// GET /api/summaries/tags — distinct tags in use across all emails, for the
// tag input's autocomplete suggestions and the tag filter's option list.
export async function GET() {
  try {
    const tags = await getDistinctTags();
    return NextResponse.json({ success: true, tags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tags";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
