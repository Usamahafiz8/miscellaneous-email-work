import { NextResponse } from "next/server";
import { fetchEmails } from "@/lib/imap";
import { currentImapConfig } from "@/lib/session";

export async function GET() {
  const config = currentImapConfig();
  if (!config) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const maxEmails = Math.min(
    Math.max(1, Number(process.env.MAX_EMAILS ?? 20)),
    100
  );

  try {
    const { emails, totalCount } = await fetchEmails(config, maxEmails);
    return NextResponse.json({ success: true, emails, count: emails.length, totalCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch emails";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
