import { NextResponse } from "next/server";
import { getDistinctSkills } from "@/lib/cache";

// GET /api/summaries/skills — distinct AI-extracted skills across all candidates,
// for the skills filter's option list.
export async function GET() {
  try {
    const skills = await getDistinctSkills();
    return NextResponse.json({ success: true, skills });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load skills";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
