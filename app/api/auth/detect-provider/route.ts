import { NextRequest, NextResponse } from "next/server";
import { detectProviderByMx } from "@/lib/detectProvider";
import { IMAP_PROVIDERS } from "@/lib/types";

// A DNS MX lookup, so allow a little room without inheriting the platform default.
export const maxDuration = 15;

// GET /api/auth/detect-provider?email=someone@company.com
// Suggests the IMAP host/port for an address by looking at who actually hosts the
// domain's mail. Unauthenticated on purpose — it runs on the login page, before
// any session exists, and reveals nothing beyond a public DNS record.
export async function GET(request: NextRequest) {
  const email = new URL(request.url).searchParams.get("email")?.trim() ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ success: true, provider: null });
  }

  const provider = await detectProviderByMx(email);
  if (!provider) {
    return NextResponse.json({ success: true, provider: null });
  }

  const preset = IMAP_PROVIDERS[provider];
  return NextResponse.json({
    success: true,
    provider,
    host: preset.host,
    port: preset.port,
    label: preset.label,
    note: preset.note,
  });
}
