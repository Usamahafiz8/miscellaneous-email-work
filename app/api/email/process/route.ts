import { NextResponse } from "next/server";
import { fetchEmails } from "@/lib/imap";
import { summarizeEmails } from "@/lib/claude";
import { cacheSummaries } from "@/lib/cache";
import type { SummaryLength } from "@/lib/types";

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

  const maxEmails = Math.min(
    Math.max(1, Number(process.env.MAX_EMAILS ?? 20)),
    100
  );

  const summaryLength = (["short", "medium", "long"].includes(
    process.env.SUMMARY_LENGTH ?? ""
  )
    ? process.env.SUMMARY_LENGTH
    : "medium") as SummaryLength;

  try {
    const emails = await fetchEmails(config, maxEmails);

    if (emails.length === 0) {
      return NextResponse.json({ success: true, summaries: [], emailCount: 0 });
    }

    const summaries = await summarizeEmails(emails, summaryLength);
    cacheSummaries(summaries);

    return NextResponse.json({
      success: true,
      summaries,
      emailCount: emails.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
