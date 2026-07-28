import { NextResponse } from "next/server";
import { getDistinctSkills } from "@/lib/cache";
import { currentAccount } from "@/lib/session";

// GET /api/summaries/skills — distinct AI-extracted skills across this account's
// candidates, for the skills filter's option list.
export async function GET() {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const skills = await getDistinctSkills(account);
    return NextResponse.json({ success: true, skills });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
