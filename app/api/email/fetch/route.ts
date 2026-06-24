import { NextResponse } from "next/server";
import { fetchEmails } from "@/lib/imap";

export async function GET() {
  const config = {
    email: process.env.EMAIL_ADDRESS ?? "",
    password: process.env.EMAIL_PASSWORD ?? "",
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
  };

  if (!config.email || !config.password || !config.host) {
    return NextResponse.json(
      { success: false, error: "Email credentials not configured in .env.local" },
      { status: 500 }
    );
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
