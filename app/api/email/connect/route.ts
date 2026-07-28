import { NextResponse } from "next/server";
import { testIMAPConnection, describeImapError } from "@/lib/imap";
import { currentImapConfig } from "@/lib/session";

// IMAP round-trip — give it more than the platform default. (Previously set in
// vercel.json, which this replaces.)
export const maxDuration = 30;

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
    return NextResponse.json({ success: false, error: describeImapError(err, config) }, { status: 400 });
  }
}
