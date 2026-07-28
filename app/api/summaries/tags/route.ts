import { NextResponse } from "next/server";
import { getDistinctTags } from "@/lib/cache";
import { currentAccount } from "@/lib/session";

// GET /api/summaries/tags — distinct tags in use across this account's emails, for
// the tag input's autocomplete suggestions and the tag filter's option list.
export async function GET() {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const tags = await getDistinctTags(account);
    return NextResponse.json({ success: true, tags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tags";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
