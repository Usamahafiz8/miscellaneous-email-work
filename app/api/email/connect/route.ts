import { NextResponse } from "next/server";
import { testIMAPConnection } from "@/lib/imap";

export async function POST() {
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

  try {
    await testIMAPConnection(config);
    return NextResponse.json({ success: true, message: "Connection successful" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
