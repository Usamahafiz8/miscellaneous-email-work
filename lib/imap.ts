import Imap from "imap";
import { simpleParser } from "mailparser";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import type { IMAPConfig, EmailMessage } from "./types";
import { sanitizeHtml } from "./validation";

const CONNECTION_TIMEOUT = 10_000;
const MAX_BODY_LENGTH = 8000;
const PREVIEW_LENGTH = 500;

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

        const fetcher = imap.seq.fetch(range, {
          bodies: ["HEADER.FIELDS (FROM SUBJECT DATE)", "TEXT"],
          struct: true,
        });

        const pendingMessages: Promise<void>[] = [];

        fetcher.on("message", (msg, seqno) => {
          let headerBuffer = "";
          let bodyBuffer = "";
          const messageId = randomUUID();

          const pending = new Promise<void>((res) => {
            msg.on("body", (stream: NodeJS.ReadableStream, info) => {
              const chunks: Buffer[] = [];
              stream.on("data", (chunk: Buffer) => chunks.push(chunk));
              stream.on("end", () => {
                const data = Buffer.concat(chunks).toString("utf-8");
                if (info.which === "TEXT") {
                  bodyBuffer = data;
                } else {
                  headerBuffer = data;
                }
              });
            });

            msg.once("end", async () => {
              try {
                const parsedHeader = await simpleParser(headerBuffer);
                const fromAddress =
                  parsedHeader.from?.text ?? "unknown@unknown.com";
                const subject = parsedHeader.subject ?? "(No Subject)";
                const date =
                  parsedHeader.date?.toISOString() ?? new Date().toISOString();

                // Parse the body to get plain text
                const fullBodyStream = Readable.from([headerBuffer, "\r\n", bodyBuffer]);
                const parsed = await simpleParser(fullBodyStream);

                let fullText =
                  parsed.text ??
                  (parsed.html ? sanitizeHtml(parsed.html) : "") ??
                  sanitizeHtml(bodyBuffer);

                fullText = fullText.slice(0, MAX_BODY_LENGTH).trim();

                const htmlBody = parsed.html
                  ? parsed.html.slice(0, 50_000)
                  : undefined;

                messages.push({
                  id: `${messageId}-${seqno}`,
                  from: fromAddress,
                  subject,
                  date,
                  text: fullText.slice(0, PREVIEW_LENGTH),
                  fullText,
                  htmlBody,
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
