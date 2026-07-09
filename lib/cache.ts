import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { EmailSummary, EmailMessage, EmailAttachment, EmailListQuery, EmailListResult } from "./types";
import { parseSearchQuery } from "./searchQuery";

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
  candidateEmploymentStatus: string | null; candidateNoticePeriod: string | null;
  candidateLocation: string | null; candidateEmploymentType: string | null;
  summarized?: boolean;
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
    candidateEmploymentStatus: row.candidateEmploymentStatus ?? undefined,
    candidateNoticePeriod: row.candidateNoticePeriod ?? undefined,
    candidateLocation: row.candidateLocation ?? undefined,
    candidateEmploymentType: row.candidateEmploymentType ?? undefined,
    fetchedAt: row.fetchedAt.toISOString(),
    // Undefined-safe: rows selected without this column (older callers) read as
    // summarized so the UI never shows a false "pending" state.
    summarized: row.summarized ?? true,
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
  stage: true, tags: true, summarized: true,
  candidateName: true, candidateRole: true, candidateExperience: true,
  candidateSkills: true, candidateEducation: true, candidateAchievements: true,
  candidateEmploymentStatus: true, candidateNoticePeriod: true, candidateLocation: true, candidateEmploymentType: true,
} as const;

export async function getCachedSummaries(query: EmailListQuery, account: string): Promise<EmailListResult> {
  const { page, pageSize, search, keywords, category, priority, status, actionRequired, stage, tags, skills, dateFrom, dateTo, sortBy = "date", sortOrder = "desc" } = query;

  // Every list query is tenant-scoped: a user only ever sees their own mailbox.
  const where: Prisma.EmailSummaryWhereInput = { account };
  if (search?.trim()) {
    // Supports Gmail-style `from:`/`subject:` operators alongside free text —
    // e.g. `from:hr@company.com subject:developer` narrows both fields, while
    // any leftover free text still applies the original 3-field OR search.
    const parsed = parseSearchQuery(search.trim());
    const clauses: Prisma.EmailSummaryWhereInput[] = [];
    if (parsed.from) clauses.push({ from: { contains: parsed.from, mode: "insensitive" } });
    if (parsed.subject) clauses.push({ subject: { contains: parsed.subject, mode: "insensitive" } });
    if (parsed.free) {
      clauses.push({
        OR: [
          { subject: { contains: parsed.free, mode: "insensitive" } },
          { from: { contains: parsed.free, mode: "insensitive" } },
          { summary: { contains: parsed.free, mode: "insensitive" } },
        ],
      });
    }
    if (clauses.length === 1) Object.assign(where, clauses[0]);
    else if (clauses.length > 1) where.AND = clauses;
  }
  if (category?.length) where.category = { in: category };
  if (priority?.length) where.priority = { in: priority };
  if (status?.length) where.status = { in: status };
  if (actionRequired?.length) where.actionRequired = { in: actionRequired };
  if (stage?.length) where.stage = { in: stage };
  if (tags?.length) where.tags = { hasSome: tags };
  if (skills?.length) where.candidateSkills = { hasSome: skills };
  if (dateFrom || dateTo) {
    // `date` is a String column (always populated via .toISOString() in lib/imap.ts),
    // so lexical gte/lte sorts correctly. A bare dateTo would exclude same-day
    // timestamps (it sorts before them), hence the end-of-day suffix.
    where.date = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: `${dateTo}T23:59:59.999Z` }),
    };
  }
  if (keywords?.trim()) {
    // candidateSkills/keyPoints are Postgres arrays — Prisma's query builder can't
    // substring-match inside array elements, so resolve matching IDs via raw SQL
    // first, then fold them into the where object like every other filter here.
    const kw = `%${keywords.trim()}%`;
    const matches = await prisma.$queryRaw<{ emailId: string }[]>(Prisma.sql`
      SELECT "emailId" FROM email_summaries
      WHERE "account" = ${account}
        AND (array_to_string("keyPoints", ' ') ILIKE ${kw}
         OR array_to_string("candidateSkills", ' ') ILIKE ${kw})
    `);
    where.emailId = { in: matches.map((m) => m.emailId) };
  }

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
export async function getSummaryCounts(account: string): Promise<{ total: number; unread: number; hiring: number; stageCounts: Record<string, number> }> {
  const [total, unread, hiring, stageGroups] = await Promise.all([
    prisma.emailSummary.count({ where: { account } }),
    prisma.emailSummary.count({ where: { account, status: "New" } }),
    prisma.emailSummary.count({ where: { account, category: "Hiring" } }),
    prisma.emailSummary.groupBy({ by: ["stage"], where: { account, category: "Hiring" }, _count: { stage: true } }),
  ]);
  const stageCounts: Record<string, number> = {};
  for (const g of stageGroups) stageCounts[g.stage] = g._count.stage;
  return { total, unread, hiring, stageCounts };
}

// Distinct tags in use across all emails, for tag-input autocomplete and the
// tag filter's option list. Cheap: unnest + distinct over a GIN-indexed array column.
export async function getDistinctTags(account: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM email_summaries WHERE "account" = ${account} ORDER BY tag
  `;
  return rows.map((r) => r.tag);
}

// Distinct AI-extracted skills across all candidates, for the skills filter's
// option list. Cheap: unnest + distinct over a GIN-indexed array column.
export async function getDistinctSkills(account: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ skill: string }[]>`
    SELECT DISTINCT unnest("candidateSkills") AS skill FROM email_summaries WHERE "account" = ${account} ORDER BY skill
  `;
  return rows.map((r) => r.skill);
}

export async function getExistingEmailIds(ids: string[], account: string): Promise<Set<string>> {
  const rows = await prisma.emailSummary.findMany({
    where: { account, emailId: { in: ids } },
    select: { emailId: true },
  });
  return new Set(rows.map((r) => r.emailId));
}

export async function getSummariesByIds(ids: string[], account: string): Promise<EmailSummary[]> {
  const rows = await prisma.emailSummary.findMany({
    where: { account, emailId: { in: ids } },
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
export async function getEmailDetail(emailId: string, account: string): Promise<EmailSummary | null> {
  // findFirst (not findUnique) so we can require the row to also belong to this
  // account — a user must never be able to fetch another tenant's email by id.
  const row = await prisma.emailSummary.findFirst({ where: { emailId, account } });
  return row ? toEmailSummary(row) : null;
}

const PRIORITY_RANK: Record<EmailSummary["priority"], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export async function cacheSummaries(summaries: EmailSummary[], account: string): Promise<void> {
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
          summarized: true,
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
          candidateEmploymentStatus: s.candidateEmploymentStatus ?? null,
          candidateNoticePeriod: s.candidateNoticePeriod ?? null,
          candidateLocation: s.candidateLocation ?? null,
          candidateEmploymentType: s.candidateEmploymentType ?? null,
        },
        create: {
          emailId: s.emailId,
          account,
          summarized: true,
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
          candidateEmploymentStatus: s.candidateEmploymentStatus ?? null,
          candidateNoticePeriod: s.candidateNoticePeriod ?? null,
          candidateLocation: s.candidateLocation ?? null,
          candidateEmploymentType: s.candidateEmploymentType ?? null,
        },
      })
    ),
    { timeout: 60_000, maxWait: 10_000 }
  );
}

// Stores freshly-fetched emails as raw, un-summarized rows (summarized=false) so
// they appear in the inbox immediately without any AI call — the LLM fills in the
// summary/category/candidate fields lazily on first open (see the resync route).
// Uses createMany + skipDuplicates so rows that already exist (summarized OR still
// pending) are left completely untouched: we never clobber an existing summary or
// the user's status/stage/tags. Returns how many new rows were inserted.
export async function cacheRawEmails(
  emails: Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText" | "htmlBody" | "attachments">[],
  account: string
): Promise<number> {
  if (emails.length === 0) return 0;
  const { count } = await prisma.emailSummary.createMany({
    data: emails.map((e) => ({
      emailId: e.id,
      account,
      summarized: false,
      from: e.from,
      subject: e.subject,
      date: e.date,
      body: e.fullText ?? null,
      htmlBody: e.htmlBody ?? null,
      attachments: e.attachments ? JSON.stringify(e.attachments) : null,
      // Placeholder AI fields — schema-valid (these columns are non-null) and
      // neutral. Overwritten the first time the email is opened & summarized.
      summary: "",
      keyPoints: [],
      sentiment: "neutral",
      category: "General",
      priority: "Medium",
      priorityRank: 2,
      actionRequired: "No",
      purpose: "",
    })),
    skipDuplicates: true,
  });
  return count;
}

export async function clearCache(account: string): Promise<void> {
  await prisma.emailSummary.deleteMany({ where: { account } });
}
