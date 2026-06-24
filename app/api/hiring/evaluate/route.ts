import { NextRequest, NextResponse } from "next/server";
import { evaluateCandidate } from "@/lib/claude";
import type { HiringCriteria } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { summary, keyPoints, subject, criteria } = body as {
    summary: string;
    keyPoints: string[];
    subject: string;
    criteria: HiringCriteria;
  };

  if (!summary || !criteria?.position) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  try {
    const evaluation = await evaluateCandidate(summary, keyPoints ?? [], subject ?? "", criteria);
    return NextResponse.json({ success: true, evaluation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
