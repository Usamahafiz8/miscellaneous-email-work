import { NextRequest, NextResponse } from "next/server";
import { fetchNewEmailsByUid, describeImapError } from "@/lib/imap";
import { cacheRawEmails, getCachedSummaries, getMailboxCursor, setMailboxCursor } from "@/lib/cache";
import { parseEmailListQuery } from "@/lib/queryParams";
import { currentAccount, currentImapConfig } from "@/lib/session";

// No LLM here (POST downloads new mail and stores raw rows; GET is DB-only), but
// the IMAP fetch has a 60s internal timeout, so keep headroom above it.
export const maxDuration = 90;

// Cap on how many *new* messages one request downloads. Unlike the old page
// size this is not a window over the mailbox — it only ever bounds genuinely
// unseen mail, so the steady-state sync fetches 0 and returns in milliseconds.
const BATCH_SIZE = 50;

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

// Downloads mail this account hasn't seen yet and stores it as raw,
// un-summarized rows. No AI runs here: the LLM is invoked separately (lazily on
// first open, or via /api/email/summarize-pending), so a sync never waits on it.
//
// Driven by the stored UID watermark rather than a client-supplied offset — the
// server asks IMAP "what's above UID N", so with no new mail nothing is
// downloaded at all and this returns in milliseconds. The client loops while
// `remaining > 0` to drain a backlog.
export async function POST() {
  const account = currentAccount();
  const config = currentImapConfig();
  if (!account || !config) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const cursor = await getMailboxCursor(account);
    const result = await fetchNewEmailsByUid(config, cursor, BATCH_SIZE);

    // Store first, advance the watermark second: if the write fails we'd rather
    // re-download this batch next time than skip past it permanently.
    const newCount = await cacheRawEmails(result.emails, account);
    await setMailboxCursor(account, {
      uidValidity: result.uidValidity,
      lastSeenUid: result.lastSeenUid,
    });

    return NextResponse.json({
      success: true,
      newCount,
      // Genuinely-new messages downloaded this call (>= newCount; the difference
      // is mail already stored under a Message-ID we'd seen before).
      fetched: result.emails.length,
      // Known-new messages still queued on the server — client loops until 0.
      remaining: result.remaining,
      totalCount: result.totalCount,
      // The mailbox was re-keyed server-side, so this sync is re-reading it from
      // the beginning; existing rows still dedup on Message-ID.
      uidValidityChanged: result.uidValidityChanged,
    });
  } catch (err) {
    // Same translation as sign-in: a sync can fail for exactly the same
    // provider-specific reasons (Gmail revoking an app password, IMAP switched
    // off), and raw node-imap text in a toast is no more readable than it was
    // on the login screen.
    return NextResponse.json({ success: false, error: describeImapError(err, config) }, { status: 500 });
  }
}
