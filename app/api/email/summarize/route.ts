import { NextRequest, NextResponse } from "next/server";
import { summarizeEmails } from "@/lib/claude";
import { cacheSummaries } from "@/lib/cache";
import { validateSummarizeRequest } from "@/lib/validation";
import { currentAccount } from "@/lib/session";
import type { SummarizeRequest } from "@/lib/types";

// Batch LLM summarization — allow up to 5 minutes (was capped at 60s in
// vercel.json, which this replaces). Vercel Pro; Hobby caps at 60s.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const req = body as SummarizeRequest;
  const validation = validateSummarizeRequest(req);
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: validation.errors },
      { status: 400 }
    );
  }

  try {
    const summaries = await summarizeEmails(req.emails, req.summaryLength);
    await cacheSummaries(summaries, account);
    return NextResponse.json({ success: true, summaries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to summarize emails";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
