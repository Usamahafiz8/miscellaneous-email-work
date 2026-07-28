import { NextRequest, NextResponse } from "next/server";
import { testIMAPConnection, describeImapError } from "@/lib/imap";
import { setSessionCookie } from "@/lib/session";

// POST /api/auth/login
// Authenticates a PurelyMail (or any IMAP) user by attempting a real IMAP login
// with their email + password. On success, the credentials are encrypted into an
// httpOnly session cookie; they're never stored server-side. body:
//   { email, password, host?, port? }  (host/port default to PurelyMail)
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password, host, port } = body as {
    email?: string; password?: string; host?: string; port?: number;
  };

  if (!email?.trim() || !password) {
    return NextResponse.json(
      { success: false, error: "Email and password are required" },
      { status: 400 }
    );
  }

  const config = {
    email: email.trim(),
    password,
    host: host?.trim() || process.env.IMAP_HOST || "imap.purelymail.com",
    port: Number(port) || Number(process.env.IMAP_PORT) || 993,
  };

  try {
    await testIMAPConnection(config);
  } catch (err) {
    // Raw node-imap/OpenSSL text is unreadable (a mistyped port reports a
    // tls_validate_record_header failure), so translate it into the actual
    // problem before it reaches the login screen.
    return NextResponse.json(
      { success: false, error: describeImapError(err, config) },
      { status: 401 }
    );
  }

  setSessionCookie(config);
  return NextResponse.json({ success: true, email: config.email.toLowerCase() });
}
