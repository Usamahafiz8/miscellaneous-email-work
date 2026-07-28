import { NextResponse } from "next/server";
import { getSummaryCounts } from "@/lib/cache";
import { currentAccount } from "@/lib/session";

// GET /api/summaries/counts — lightweight sidebar badge counts (total/unread/hiring)
// across this account's dataset, independent of whatever page a view has loaded.
export async function GET() {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const counts = await getSummaryCounts(account);
    return NextResponse.json({ success: true, ...counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load counts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
