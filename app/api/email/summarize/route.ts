import { NextRequest, NextResponse } from "next/server";
import { summarizeEmails } from "@/lib/claude";
import { cacheSummaries } from "@/lib/cache";
import { validateSummarizeRequest } from "@/lib/validation";
import type { SummarizeRequest } from "@/lib/types";

export async function POST(request: NextRequest) {
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
    cacheSummaries(summaries);
    return NextResponse.json({ success: true, summaries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to summarize emails";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
