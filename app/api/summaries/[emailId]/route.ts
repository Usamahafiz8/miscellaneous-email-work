import { NextRequest, NextResponse } from "next/server";
import { getEmailDetail } from "@/lib/cache";

// GET /api/summaries/[emailId] — full email content (body/htmlBody/attachments),
// fetched lazily when a user opens an email's detail pane.
export async function GET(_request: NextRequest, { params }: { params: { emailId: string } }) {
  try {
    const summary = await getEmailDetail(params.emailId);
    if (!summary) {
      return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load email";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
