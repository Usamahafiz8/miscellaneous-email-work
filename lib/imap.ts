import Imap from "imap";
import { simpleParser } from "mailparser";
import { randomUUID } from "crypto";
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

        fetcher.on("message", (msg, seqno) => {
          const chunks: Buffer[] = [];
          const messageId = randomUUID();

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

                messages.push({
                  id: `${messageId}-${seqno}`,
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
