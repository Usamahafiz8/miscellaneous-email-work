import Imap from "imap";
import { simpleParser } from "mailparser";
import { createHash } from "crypto";
import type { IMAPConfig, EmailMessage, EmailAttachment } from "./types";
import { sanitizeHtml } from "./validation";

const CONNECTION_TIMEOUT = 10_000;
const MAX_BODY_LENGTH = 8000;
const PREVIEW_LENGTH = 500;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;  // 5 MB per attachment
const MAX_TOTAL_ATTACH_BYTES = 10 * 1024 * 1024; // 10 MB total per email

const PDF_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/acrobat",
]);

function isPdf(contentType: string, filename?: string): boolean {
  const type = contentType.toLowerCase().split(";")[0].trim();
  if (PDF_TYPES.has(type)) return true;
  return !!filename?.toLowerCase().endsWith(".pdf");
}

// Turns the raw error from node-imap/OpenSSL into something a person can act on.
// These surface verbatim on the login screen otherwise, and the useful ones are
// unreadable — a mistyped port reports
// "error:0A00010B:SSL routines:tls_validate_record_header:wrong version number",
// which says nothing about the actual mistake (an SMTP or plaintext port given
// to a client that always speaks implicit TLS).
export function describeImapError(err: unknown, config?: Pick<IMAPConfig, "host" | "port">): string {
  const raw = err instanceof Error ? err.message : String(err);
  const where = config ? ` (${config.host}:${config.port})` : "";

  // TLS handshake got a non-TLS reply: the port isn't an SSL port at all.
  if (/wrong version number|record layer failure|packet length too long/i.test(raw)) {
    return `That port doesn't accept a secure connection${where}. This app reads mail over IMAP, not SMTP — so SMTP ports (587, 465, 25) won't work. Use your provider's IMAP host on port 993, e.g. imap.gmail.com:993 for Gmail.`;
  }
  if (/AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|authentication failed/i.test(raw)) {
    return `The server rejected that email and password${where}. Gmail, Yahoo and two-step-verified Outlook accounts refuse normal passwords — you need an app password instead of your login password.`;
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) {
    return `Couldn't find that mail server${where}. Check the IMAP host for a typo.`;
  }
  if (/ECONNREFUSED/i.test(raw)) {
    return `Nothing is listening on that port${where}. IMAP is almost always port 993.`;
  }
  if (/ETIMEDOUT|timed out/i.test(raw)) {
    return `The mail server didn't respond${where}. Port 143 will hang like this because it isn't encrypted — try 993. Otherwise a firewall may be blocking IMAP.`;
  }
  if (/certificate|self.signed|CERT_/i.test(raw)) {
    return `The mail server's security certificate couldn't be verified${where}.`;
  }
  // Unrecognized — pass it through rather than swallow a real diagnostic.
  return raw;
}

function createImapClient(config: IMAPConfig): Imap {
  return new Imap({
    user: config.email,
    password: config.password,
    host: config.host,
    port: config.port,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: CONNECTION_TIMEOUT,
    connTimeout: CONNECTION_TIMEOUT,
  });
}

export async function testIMAPConnection(config: IMAPConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = createImapClient(config);

    const timeout = setTimeout(() => {
      imap.destroy();
      reject(new Error("Connection timed out after 10 seconds"));
    }, CONNECTION_TIMEOUT);

    imap.once("ready", () => {
      clearTimeout(timeout);
      imap.end();
      resolve();
    });

    imap.once("error", (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    imap.connect();
  });
}

// Where a mailbox's sync left off. Persisted per account (see MailboxSync).
export interface MailboxCursor {
  uidValidity: number;
  lastSeenUid: number;
}

export interface UidFetchResult {
  // Only messages that were actually new — never anything already downloaded.
  emails: EmailMessage[];
  uidValidity: number;
  // Advance the stored watermark to this. Includes UIDs we deliberately skipped
  // (unparseable messages), so a bad message can't wedge the sync forever.
  lastSeenUid: number;
  // Known-new UIDs left over beyond `limit` — lets the caller loop with progress.
  remaining: number;
  totalCount: number;
  // The server changed uidValidity: every stored UID is now meaningless and the
  // caller must treat this as a from-scratch re-read of the mailbox.
  uidValidityChanged: boolean;
}

// Parses one full RFC 2822 message into an EmailMessage. Shared by both fetch
// paths so the two can't drift in how they derive ids, bodies or attachments.
async function parseMessage(raw: Buffer, uid?: number): Promise<EmailMessage> {
  const parsed = await simpleParser(raw);

  const fromAddress = parsed.from?.text ?? "unknown@unknown.com";
  const subject = parsed.subject ?? "(No Subject)";
  const date = parsed.date?.toISOString() ?? new Date().toISOString();

  let fullText = parsed.text ?? (parsed.html ? sanitizeHtml(parsed.html) : "") ?? "";
  fullText = fullText.slice(0, MAX_BODY_LENGTH).trim();

  const htmlBody = parsed.html ? parsed.html.slice(0, 50_000) : undefined;

  const attachments: EmailAttachment[] = [];
  let totalSize = 0;
  for (const att of parsed.attachments ?? []) {
    if (!isPdf(att.contentType, att.filename)) continue;
    const size = att.content.byteLength;
    if (size > MAX_ATTACHMENT_BYTES) continue;
    if (totalSize + size > MAX_TOTAL_ATTACH_BYTES) break;
    attachments.push({
      filename: att.filename ?? "attachment.pdf",
      contentType: att.contentType,
      size,
      data: att.content.toString("base64"),
    });
    totalSize += size;
  }

  // Stable, mailbox-unique id so a re-sync recognizes mail it has already
  // stored (dedup is keyed on this). The RFC 5322 Message-ID header is globally
  // unique and stable per message; fall back to a deterministic hash of the
  // envelope for the rare message without one. Never random — a random id looks
  // "new" on every fetch and piles up duplicate rows.
  const stableId = parsed.messageId?.trim()
    || "hash-" + createHash("sha1")
         .update(`${fromAddress}|${subject}|${parsed.date?.toISOString() ?? ""}`)
         .digest("hex");

  return {
    id: stableId,
    uid,
    from: fromAddress,
    subject,
    date,
    text: fullText.slice(0, PREVIEW_LENGTH),
    fullText,
    htmlBody,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

// Downloads only mail this account hasn't seen before.
//
// Replaces the old sequence-number window (`${total - offset}:${total}`), which
// had two problems: it re-downloaded 50 complete messages on every sync just to
// discover it already had them, and sequence numbers *shift* whenever mail
// arrives or is deleted — so during a long import windows overlapped (wasted
// work) and, worse, some messages were skipped entirely.
//
// UIDs don't shift. Pass the stored cursor and this asks the server directly for
// what's above the watermark; with no new mail that's one SEARCH and no message
// bodies at all.
export async function fetchNewEmailsByUid(
  config: IMAPConfig,
  cursor: MailboxCursor | null,
  limit: number,
  // Called once per message, the moment it finishes parsing — IMAP delivers
  // messages one at a time, so this lets a caller forward each one onward (see
  // the SSE route) instead of waiting for the whole batch to land. Purely
  // observational: throwing in here must not abort the fetch, so it's guarded.
  onEmail?: (email: EmailMessage, index: number, batchSize: number) => void
): Promise<UidFetchResult> {
  return new Promise((resolve, reject) => {
    const imap = createImapClient(config);

    const timeout = setTimeout(() => {
      imap.destroy();
      reject(new Error("Fetch timed out after 60 seconds"));
    }, 60_000);

    const done = (result: UidFetchResult) => {
      clearTimeout(timeout);
      imap.end();
      resolve(result);
    };
    const fail = (err: Error) => {
      clearTimeout(timeout);
      imap.destroy();
      reject(err);
    };

    imap.once("ready", () => {
      imap.openBox("INBOX", true, (err, box) => {
        if (err) return fail(err);

        const uidValidity = Number(box.uidvalidity);
        const totalCount = box.messages.total;

        // A changed uidValidity invalidates every stored UID — start over.
        const uidValidityChanged = !!cursor && cursor.uidValidity !== uidValidity;
        const lastSeenUid = !cursor || uidValidityChanged ? 0 : cursor.lastSeenUid;

        if (totalCount === 0) {
          return done({ emails: [], uidValidity, lastSeenUid, remaining: 0, totalCount, uidValidityChanged });
        }

        imap.search([["UID", `${lastSeenUid + 1}:*`]], (searchErr, rawUids) => {
          if (searchErr) return fail(searchErr);

          // IMAP quirk: `n:*` is never empty — when n exceeds the highest UID in
          // the mailbox the server returns the *last* message anyway. Without
          // this filter every "no new mail" sync would re-download one message
          // and, if it had no Message-ID, insert it again.
          const uids = (rawUids ?? [])
            .map(Number)
            .filter((u) => Number.isFinite(u) && u > lastSeenUid)
            .sort((a, b) => a - b);

          if (uids.length === 0) {
            return done({ emails: [], uidValidity, lastSeenUid, remaining: 0, totalCount, uidValidityChanged });
          }

          // Oldest-first so the watermark only ever advances over a contiguous,
          // fully-processed run — a crash mid-batch can't strand newer mail
          // behind an advanced cursor.
          const batch = uids.slice(0, limit);
          const remaining = uids.length - batch.length;
          const highestInBatch = batch[batch.length - 1];

          const messages: EmailMessage[] = [];
          const pending: Promise<void>[] = [];

          const fetcher = imap.fetch(batch, { bodies: [""], struct: true });

          fetcher.on("message", (msg) => {
            const chunks: Buffer[] = [];
            let uid: number | undefined;

            pending.push(new Promise<void>((res) => {
              msg.on("body", (stream: NodeJS.ReadableStream) => {
                stream.on("data", (chunk: Buffer) => chunks.push(chunk));
              });
              msg.once("attributes", (attrs) => { uid = Number(attrs.uid); });
              msg.once("end", async () => {
                try {
                  const email = await parseMessage(Buffer.concat(chunks), uid);
                  messages.push(email);
                  try {
                    onEmail?.(email, messages.length, batch.length);
                  } catch (cbErr) {
                    // A broken consumer (e.g. a closed SSE stream) must not cost
                    // us the download — the message is already in `messages`.
                    console.warn("fetchNewEmailsByUid: onEmail callback threw —", cbErr instanceof Error ? cbErr.message : cbErr);
                  }
                } catch (parseErr) {
                  // Skipped permanently, not retried: the watermark advances past
                  // it below regardless, so one malformed message can't wedge
                  // every later sync behind it.
                  console.warn(`fetchNewEmailsByUid: skipping unparseable message uid=${uid} —`, parseErr instanceof Error ? parseErr.message : parseErr);
                }
                res();
              });
            }));
          });

          fetcher.once("error", fail);

          fetcher.once("end", async () => {
            await Promise.all(pending);
            messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            done({
              emails: messages,
              uidValidity,
              // Advance over the whole batch, including anything skipped above.
              lastSeenUid: highestInBatch,
              remaining,
              totalCount,
              uidValidityChanged,
            });
          });
        });
      });
    });

    imap.once("error", fail);
    imap.connect();
  });
}

export async function fetchEmails(
  config: IMAPConfig,
  pageSize: number,
  offset: number = 0
): Promise<{ emails: EmailMessage[]; totalCount: number }> {
  return new Promise((resolve, reject) => {
    const imap = createImapClient(config);
    const messages: EmailMessage[] = [];

    const timeout = setTimeout(() => {
      imap.destroy();
      reject(new Error("Fetch timed out after 30 seconds"));
    }, 30_000);

    imap.once("ready", () => {
      imap.openBox("INBOX", true, (err, box) => {
        if (err) {
          clearTimeout(timeout);
          imap.end();
          return reject(err);
        }

        const total = box.messages.total;
        if (total === 0) {
          clearTimeout(timeout);
          imap.end();
          return resolve({ emails: [], totalCount: 0 });
        }

        // newest-first pagination: offset skips from the most recent end
        const end = Math.max(1, total - offset);
        const fetchCount = Math.min(pageSize, end);
        const start = Math.max(1, end - fetchCount + 1);
        const range = `${start}:${end}`;

        // Fetch the full RFC 2822 message so mailparser can extract attachments
        const fetcher = imap.seq.fetch(range, {
          bodies: [""],
          struct: true,
        });

        const pendingMessages: Promise<void>[] = [];

        fetcher.on("message", (msg) => {
          const chunks: Buffer[] = [];

          const pending = new Promise<void>((res) => {
            msg.on("body", (stream: NodeJS.ReadableStream) => {
              stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            });

            msg.once("end", async () => {
              try {
                const raw = Buffer.concat(chunks);
                const parsed = await simpleParser(raw);

                const fromAddress = parsed.from?.text ?? "unknown@unknown.com";
                const subject = parsed.subject ?? "(No Subject)";
                const date = parsed.date?.toISOString() ?? new Date().toISOString();

                let fullText =
                  parsed.text ??
                  (parsed.html ? sanitizeHtml(parsed.html) : "") ??
                  "";
                fullText = fullText.slice(0, MAX_BODY_LENGTH).trim();

                const htmlBody = parsed.html
                  ? parsed.html.slice(0, 50_000)
                  : undefined;

                // Extract PDF attachments within size limits
                const attachments: EmailAttachment[] = [];
                let totalSize = 0;
                for (const att of parsed.attachments ?? []) {
                  if (!isPdf(att.contentType, att.filename)) continue;
                  const size = att.content.byteLength;
                  if (size > MAX_ATTACHMENT_BYTES) continue;
                  if (totalSize + size > MAX_TOTAL_ATTACH_BYTES) break;
                  attachments.push({
                    filename: att.filename ?? "attachment.pdf",
                    contentType: att.contentType,
                    size,
                    data: att.content.toString("base64"),
                  });
                  totalSize += size;
                }

                // Stable, mailbox-unique id so a re-sync recognizes mail it has
                // already stored (dedup is keyed on this). The RFC 5322 Message-ID
                // header is globally unique and stable per message; fall back to a
                // deterministic hash of the envelope for the rare message without
                // one. Never random — a random id looks "new" on every fetch and
                // piles up duplicate rows.
                const stableId = parsed.messageId?.trim()
                  || "hash-" + createHash("sha1")
                       .update(`${fromAddress}|${subject}|${parsed.date?.toISOString() ?? ""}`)
                       .digest("hex");

                messages.push({
                  id: stableId,
                  from: fromAddress,
                  subject,
                  date,
                  text: fullText.slice(0, PREVIEW_LENGTH),
                  fullText,
                  htmlBody,
                  attachments: attachments.length > 0 ? attachments : undefined,
                });
              } catch {
                // Skip unparseable messages
              }
              res();
            });
          });

          pendingMessages.push(pending);
        });

        fetcher.once("error", (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });

        fetcher.once("end", async () => {
          await Promise.all(pendingMessages);
          clearTimeout(timeout);
          imap.end();
          // Sort newest first
          messages.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          resolve({ emails: messages, totalCount: total });
        });
      });
    });

    imap.once("error", (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    imap.connect();
  });
}
