import { NextResponse } from "next/server";
import { fetchNewEmailsByUid } from "@/lib/imap";
import { cacheRawEmails, getMailboxCursor, setMailboxCursor } from "@/lib/cache";
import { currentAccount, currentImapConfig } from "@/lib/session";
import type { EmailMessage } from "@/lib/types";

// One IMAP batch per request (see the `remaining` contract below), so this only
// needs headroom over the fetch's own 60s timeout — not the whole backlog.
export const maxDuration = 90;

// Matches BATCH_SIZE in /api/email/process — one request downloads at most this
// many *new* messages, then reports how many are still queued so the client can
// re-open the stream. Bounding it per request keeps any single response well
// inside maxDuration no matter how large the backlog is.
const BATCH_SIZE = 50;

// POST /api/email/stream
// Server-Sent Events version of POST /api/email/process. Identical work and the
// same UID watermark, but instead of going quiet and returning one lump at the
// end, it emits an event per message the moment IMAP hands it over — so the UI
// can show mail landing one at a time as it actually happens.
//
// Event shapes (all `data: <json>` lines):
//   {type:"start",   batchSize, remaining}          before the first message
//   {type:"email",   index, batchSize, summary}     one per message, as parsed
//   {type:"done",    newCount, fetched, remaining}  after the batch is persisted
//   {type:"error",   error}                         terminal failure
//
// `remaining > 0` in the done event means the client should open another stream.
export async function POST() {
  const account = currentAccount();
  const config = currentImapConfig();
  if (!account || !config) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Client navigated away / aborted. Stop writing, but let the fetch and
          // the DB write below run to completion — the mail is worth keeping
          // even though nobody is watching it arrive.
          closed = true;
        }
      };

      try {
        const cursor = await getMailboxCursor(account);

        const result = await fetchNewEmailsByUid(
          config,
          cursor,
          BATCH_SIZE,
          (email, index, batchSize) => {
            if (index === 1) send({ type: "start", batchSize });
            // Deliberately a trimmed projection, not the parsed message: the
            // real one carries the full body, HTML and base64 PDFs, which would
            // be megabytes per event for fields the arriving row never renders.
            send({
              type: "email",
              index,
              batchSize,
              summary: previewOf(email),
            });
          }
        );

        // Persist after the batch completes, then advance the watermark — same
        // order as /api/email/process, so a failed write re-downloads rather
        // than silently skipping.
        const newCount = await cacheRawEmails(result.emails, account);
        await setMailboxCursor(account, {
          uidValidity: result.uidValidity,
          lastSeenUid: result.lastSeenUid,
        });

        send({
          type: "done",
          newCount,
          fetched: result.emails.length,
          remaining: result.remaining,
          totalCount: result.totalCount,
          uidValidityChanged: result.uidValidityChanged,
        });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Sync failed" });
      } finally {
        try { controller.close(); } catch { /* already closed by the client */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells any intermediate proxy not to buffer the response, which would
      // defeat the entire point by holding events back until the stream ends.
      "X-Accel-Buffering": "no",
    },
  });
}

// The subset a newly-arrived list row actually renders. Mirrors the placeholder
// AI fields cacheRawEmails() writes, so the streamed row looks exactly like what
// a refetch would return for the same email a moment later — no visual pop when
// the real data replaces it.
function previewOf(email: EmailMessage) {
  return {
    emailId: email.id,
    from: email.from,
    subject: email.subject,
    date: email.date,
    summary: "",
    keyPoints: [],
    sentiment: "neutral",
    category: "General",
    priority: "Medium",
    actionRequired: "No",
    purpose: "",
    status: "New",
    stage: "New",
    tags: [],
    candidateSkills: [],
    summarized: false,
    // Count only — the payload itself stays server-side until the email is opened.
    attachments: (email.attachments ?? []).map(() => ({
      filename: "", contentType: "", size: 0, data: "",
    })),
  };
}
