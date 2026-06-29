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

export async function getCachedSummaries(limit: number, offset: number) {
  const [summaries, total] = await Promise.all([
    prisma.emailSummary.findMany({
      orderBy: { date: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.emailSummary.count(),
  ]);

  return {
    summaries: summaries.map(toEmailSummary),
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
  });
  // preserve the order of ids
  const map = new Map(rows.map((r) => [r.emailId, r]));
  return ids.flatMap((id) => (map.has(id) ? [toEmailSummary(map.get(id)!)] : []));
}

export async function cacheSummaries(summaries: EmailSummary[]): Promise<void> {
  await Promise.all(
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
    )
  );
}

export async function clearCache(): Promise<void> {
  await prisma.emailSummary.deleteMany();
}
