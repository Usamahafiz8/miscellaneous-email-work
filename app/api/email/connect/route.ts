import { NextResponse } from "next/server";
import { testIMAPConnection } from "@/lib/imap";
import { currentImapConfig } from "@/lib/session";

// POST /api/email/connect — re-tests the signed-in user's IMAP connection.
export async function POST() {
  const config = currentImapConfig();
  if (!config) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    await testIMAPConnection(config);
    return NextResponse.json({ success: true, message: "Connection successful" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
