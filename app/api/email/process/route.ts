import { NextRequest, NextResponse } from "next/server";
import { fetchEmails } from "@/lib/imap";
import { cacheRawEmails, getCachedSummaries, getExistingEmailIds, getSummariesByIds } from "@/lib/cache";
import { parseEmailListQuery } from "@/lib/queryParams";
import { currentAccount, currentImapConfig } from "@/lib/session";

// No LLM here anymore (POST just IMAP-fetches a page and stores raw rows; GET is
// DB-only), but the IMAP fetch has a 30s internal timeout, so keep 60s headroom.
export const maxDuration = 60;

const PAGE_SIZE = 50;

// Load emails from DB only — no IMAP, no AI calls. Supports the same
// filter/sort/page query contract as GET /api/summaries.
export async function GET(request: NextRequest) {
  const account = currentAccount();
  if (!account) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = parseEmailListQuery(searchParams);

  try {
    const result = await getCachedSummaries(query, account);
    return NextResponse.json({ success: true, ...result, fromCache: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load from database";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Sync from IMAP — stores newly-fetched emails as raw, un-summarized rows. No AI
// runs here: the LLM is invoked lazily the first time an email is opened (see
// POST /api/email/resync), so a sync is fast and cheap regardless of volume.
export async function POST(request: NextRequest) {
  const account = currentAccount();
  const config = currentImapConfig();
  if (!account || !config) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const offset = Math.max(0, Number(body.offset ?? 0));

  try {
    const { emails, totalCount } = await fetchEmails(config, PAGE_SIZE, offset);

    if (emails.length === 0) {
      return NextResponse.json({ success: true, summaries: [], emailCount: 0, newCount: 0, fetched: 0, pendingCount: 0, totalCount, offset });
    }

    // Which of this page's emails aren't in the DB yet (within this account)
    const existingIds = await getExistingEmailIds(emails.map((e) => e.id), account);
    const newEmails = emails.filter((e) => !existingIds.has(e.id));

    // Store the new ones as raw rows — no AI call, no batch cap needed.
    const newCount = await cacheRawEmails(newEmails, account);

    // Return this full page from DB (raw rows included, marked summarized=false)
    const summaries = await getSummariesByIds(emails.map((e) => e.id), account);

    return NextResponse.json({
      success: true,
      summaries,
      emailCount: summaries.length,
      newCount,
      // Number of messages this page actually pulled from IMAP — lets the client
      // advance `offset` and know when it has paged through the whole mailbox.
      fetched: emails.length,
      // No deferred AI work anymore — a single call fully syncs the page.
      pendingCount: 0,
      totalCount,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
