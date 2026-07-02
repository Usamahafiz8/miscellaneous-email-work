import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { EmailSummary, EmailAttachment, EmailListQuery, EmailListResult } from "./types";

function toEmailSummary(row: {
  emailId: string; from: string; subject: string; date: string;
  body: string | null; htmlBody: string | null; attachments: string | null;
  attachmentSummary?: string | null;
  summary: string; keyPoints: string[];
  sentiment: string; category: string; priority: string;
  actionRequired: string; purpose: string; status: string; fetchedAt: Date;
  stage: string; tags: string[];
  candidateName: string | null; candidateRole: string | null;
  candidateExperience: string | null; candidateSkills: string[];
  candidateEducation: string | null; candidateAchievements: string | null;
}, opts: { stripAttachmentData?: boolean } = {}): EmailSummary {
  let attachments: EmailAttachment[] | undefined;
  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments);
      // List views only need the filename/size to render the "N PDFs" badge —
      // the base64 `data` is the actual bulk (can be MBs) and is only needed
      // once a user opens the email, so it's lazily fetched via getEmailDetail().
      if (opts.stripAttachmentData) {
        attachments = attachments?.map((a) => ({ ...a, data: "" }));
      }
    } catch { /* ignore */ }
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
    stage: row.stage as EmailSummary["stage"],
    tags: row.tags,
    candidateName: row.candidateName ?? undefined,
    candidateRole: row.candidateRole ?? undefined,
    candidateExperience: row.candidateExperience ?? undefined,
    candidateSkills: row.candidateSkills,
    candidateEducation: row.candidateEducation ?? undefined,
    candidateAchievements: row.candidateAchievements ?? undefined,
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

// List views only render subject/summary/badges — body/htmlBody are large (avg
// ~8KB/email) and only needed for the single email a user has open, so they're
// excluded here and fetched on demand via getEmailDetail(). attachments IS
// fetched (needed for the "N PDFs" indicator badge/count), but its base64
// `data` is stripped below before being sent to the client.
const LIST_SELECT = {
  emailId: true, from: true, subject: true, date: true,
  body: false, htmlBody: false, attachments: true,
  attachmentSummary: true,
  summary: true, keyPoints: true, sentiment: true, category: true,
  priority: true, actionRequired: true, purpose: true, status: true, fetchedAt: true,
  stage: true, tags: true,
  candidateName: true, candidateRole: true, candidateExperience: true,
  candidateSkills: true, candidateEducation: true, candidateAchievements: true,
} as const;

export async function getCachedSummaries(query: EmailListQuery): Promise<EmailListResult> {
  const { page, pageSize, search, category, priority, status, actionRequired, stage, tags, sortBy = "date", sortOrder = "desc" } = query;

  const where: Prisma.EmailSummaryWhereInput = {};
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { from: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ];
  }
  if (category?.length) where.category = { in: category };
  if (priority?.length) where.priority = { in: priority };
  if (status?.length) where.status = { in: status };
  if (actionRequired?.length) where.actionRequired = { in: actionRequired };
  if (stage?.length) where.stage = { in: stage };
  if (tags?.length) where.tags = { hasSome: tags };

  const orderBy: Prisma.EmailSummaryOrderByWithRelationInput = { [sortBy]: sortOrder };

  const [rows, total] = await Promise.all([
    prisma.emailSummary.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: LIST_SELECT,
    }),
    prisma.emailSummary.count({ where }),
  ]);

  return {
    summaries: rows.map((s) => toEmailSummary({ ...s, body: null, htmlBody: null }, { stripAttachmentData: true })),
    total,
    page,
    pageSize,
  };
}

// Cheap COUNT-only queries for sidebar badges — always accurate across the whole
// dataset, unlike deriving counts from whatever page happens to be loaded client-side.
export async function getSummaryCounts(): Promise<{ total: number; unread: number; hiring: number; stageCounts: Record<string, number> }> {
  const [total, unread, hiring, stageGroups] = await Promise.all([
    prisma.emailSummary.count(),
    prisma.emailSummary.count({ where: { status: "New" } }),
    prisma.emailSummary.count({ where: { category: "Hiring" } }),
    prisma.emailSummary.groupBy({ by: ["stage"], where: { category: "Hiring" }, _count: { stage: true } }),
  ]);
  const stageCounts: Record<string, number> = {};
  for (const g of stageGroups) stageCounts[g.stage] = g._count.stage;
  return { total, unread, hiring, stageCounts };
}

// Distinct tags in use across all emails, for tag-input autocomplete and the
// tag filter's option list. Cheap: unnest + distinct over a GIN-indexed array column.
export async function getDistinctTags(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM email_summaries ORDER BY tag
  `;
  return rows.map((r) => r.tag);
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
    map.has(id) ? [toEmailSummary({ ...map.get(id)!, body: null, htmlBody: null }, { stripAttachmentData: true })] : []
  );
}

// Fetches the full row (including body/htmlBody/attachments) for a single email —
// used when a user opens an email's detail pane.
export async function getEmailDetail(emailId: string): Promise<EmailSummary | null> {
  const row = await prisma.emailSummary.findUnique({ where: { emailId } });
  return row ? toEmailSummary(row) : null;
}

const PRIORITY_RANK: Record<EmailSummary["priority"], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

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
          priorityRank: PRIORITY_RANK[s.priority],
          actionRequired: s.actionRequired,
          purpose: s.purpose,
          attachmentSummary: s.attachmentSummary ?? null,
          // AI-derived — safe to refresh on every re-summarize, same as attachmentSummary.
          // Deliberately NOT touching `tags`/`stage` here: those are user-set data, not
          // AI output, and must survive a resync untouched.
          candidateName: s.candidateName ?? null,
          candidateRole: s.candidateRole ?? null,
          candidateExperience: s.candidateExperience ?? null,
          candidateSkills: s.candidateSkills ?? [],
          candidateEducation: s.candidateEducation ?? null,
          candidateAchievements: s.candidateAchievements ?? null,
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
          priorityRank: PRIORITY_RANK[s.priority],
          actionRequired: s.actionRequired,
          purpose: s.purpose,
          status: s.status ?? "New",
          candidateName: s.candidateName ?? null,
          candidateRole: s.candidateRole ?? null,
          candidateExperience: s.candidateExperience ?? null,
          candidateSkills: s.candidateSkills ?? [],
          candidateEducation: s.candidateEducation ?? null,
          candidateAchievements: s.candidateAchievements ?? null,
        },
      })
    ),
    { timeout: 60_000, maxWait: 10_000 }
  );
}

export async function clearCache(): Promise<void> {
  await prisma.emailSummary.deleteMany();
}
