import { prisma } from "./db";
import type { EmailSummary, EmailAttachment } from "./types";

function toEmailSummary(row: {
  emailId: string; from: string; subject: string; date: string;
  body: string | null; htmlBody: string | null; attachments: string | null;
  attachmentSummary?: string | null;
  summary: string; keyPoints: string[];
  sentiment: string; category: string; priority: string;
  actionRequired: string; purpose: string; status: string; fetchedAt: Date;
}): EmailSummary {
  let attachments: EmailAttachment[] | undefined;
  if (row.attachments) {
    try { attachments = JSON.parse(row.attachments); } catch { /* ignore */ }
  }
  return {
    emailId: row.emailId,
    from: row.from,
    subject: row.subject,
    date: row.date,
    body: row.body ?? undefined,
    htmlBody: row.htmlBody ?? undefined,
    attachments,
    attachmentSummary: row.attachmentSummary ?? undefined,
    summary: row.summary,
    keyPoints: row.keyPoints,
    sentiment: row.sentiment as EmailSummary["sentiment"],
    category: row.category as EmailSummary["category"],
    priority: row.priority as EmailSummary["priority"],
    actionRequired: row.actionRequired as EmailSummary["actionRequired"],
    purpose: row.purpose,
    status: row.status as EmailSummary["status"],
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

// List views only render subject/summary/badges — body/htmlBody/attachments are
// large (avg ~8KB/email) and only needed for the single email a user has open,
// so they're excluded here and fetched on demand via getEmailDetail().
const LIST_SELECT = {
  emailId: true, from: true, subject: true, date: true,
  body: false, htmlBody: false, attachments: false,
  attachmentSummary: true,
  summary: true, keyPoints: true, sentiment: true, category: true,
  priority: true, actionRequired: true, purpose: true, status: true, fetchedAt: true,
} as const;

export async function getCachedSummaries(limit: number, offset: number) {
  const [summaries, total] = await Promise.all([
    prisma.emailSummary.findMany({
      orderBy: { date: "desc" },
      take: limit,
      skip: offset,
      select: LIST_SELECT,
    }),
    prisma.emailSummary.count(),
  ]);

  return {
    summaries: summaries.map((s) => toEmailSummary({ ...s, body: null, htmlBody: null, attachments: null })),
    total,
    limit,
    offset,
  };
}

export async function getExistingEmailIds(ids: string[]): Promise<Set<string>> {
  const rows = await prisma.emailSummary.findMany({
    where: { emailId: { in: ids } },
    select: { emailId: true },
  });
  return new Set(rows.map((r) => r.emailId));
}

export async function getSummariesByIds(ids: string[]): Promise<EmailSummary[]> {
  const rows = await prisma.emailSummary.findMany({
    where: { emailId: { in: ids } },
    select: LIST_SELECT,
  });
  // preserve the order of ids
  const map = new Map(rows.map((r) => [r.emailId, r]));
  return ids.flatMap((id) =>
    map.has(id) ? [toEmailSummary({ ...map.get(id)!, body: null, htmlBody: null, attachments: null })] : []
  );
}

// Fetches the full row (including body/htmlBody/attachments) for a single email —
// used when a user opens an email's detail pane.
export async function getEmailDetail(emailId: string): Promise<EmailSummary | null> {
  const row = await prisma.emailSummary.findUnique({ where: { emailId } });
  return row ? toEmailSummary(row) : null;
}

export async function cacheSummaries(summaries: EmailSummary[]): Promise<void> {
  if (summaries.length === 0) return;
  // Each upsert is its own round-trip (not a single batched statement), and rows can carry
  // a large htmlBody (tens of KB), so a batch of NEW_EMAIL_BATCH (15) upserts can comfortably
  // exceed Prisma's 5s default transaction timeout over a pooled Neon connection — raise it
  // well above what a real batch needs, bounded by the route's 300s maxDuration.
  await prisma.$transaction(
    summaries.map((s) =>
      prisma.emailSummary.upsert({
        where: { emailId: s.emailId },
        update: {
          summary: s.summary,
          keyPoints: s.keyPoints,
          sentiment: s.sentiment,
          category: s.category,
          priority: s.priority,
          actionRequired: s.actionRequired,
          purpose: s.purpose,
          attachmentSummary: s.attachmentSummary ?? null,
        },
        create: {
          emailId: s.emailId,
          from: s.from,
          subject: s.subject,
          date: s.date,
          body: s.body ?? null,
          htmlBody: s.htmlBody ?? null,
          attachments: s.attachments ? JSON.stringify(s.attachments) : null,
          attachmentSummary: s.attachmentSummary ?? null,
          summary: s.summary,
          keyPoints: s.keyPoints,
          sentiment: s.sentiment,
          category: s.category,
          priority: s.priority,
          actionRequired: s.actionRequired,
          purpose: s.purpose,
          status: s.status ?? "New",
        },
      })
    ),
    { timeout: 60_000, maxWait: 10_000 }
  );
}

export async function clearCache(): Promise<void> {
  await prisma.emailSummary.deleteMany();
}
