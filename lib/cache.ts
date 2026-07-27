import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { EmailSummary, EmailMessage, EmailAttachment, EmailListQuery, EmailListResult } from "./types";
import type { MailboxCursor } from "./imap";
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
}): EmailSummary {
  // Only the detail path passes a non-null `attachments` — list callers select
  // the column out entirely and get their counts from attachAttachmentCounts().
  let attachments: EmailAttachment[] | undefined;
  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments);
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
// excluded here and fetched on demand via getEmailDetail().
//
// `attachments` is excluded too. It used to be selected so the list could render
// its "N PDFs" badge from attachments.length, with the base64 `data` stripped in
// Node afterwards — but by then Postgres had already shipped every byte of it
// over the wire (megabytes per page, for a badge that only needs a number).
// attachAttachmentCounts() below supplies the count via a COUNT-only query
// instead, so `.length` still reads correctly on the client.
const LIST_SELECT = {
  emailId: true, from: true, subject: true, date: true,
  body: false, htmlBody: false, attachments: false,
  attachmentSummary: true,
  summary: true, keyPoints: true, sentiment: true, category: true,
  priority: true, actionRequired: true, purpose: true, status: true, fetchedAt: true,
  stage: true, tags: true, summarized: true,
  candidateName: true, candidateRole: true, candidateExperience: true,
  candidateSkills: true, candidateEducation: true, candidateAchievements: true,
  candidateEmploymentStatus: true, candidateNoticePeriod: true, candidateLocation: true, candidateEmploymentType: true,
} as const;

// Fills in each summary's `attachments` with a correctly-sized array of
// metadata-free placeholders, so list views can keep rendering their badge from
// `attachments.length` without any of the base64 payload crossing the wire.
// The real attachments (with `data`) arrive via getEmailDetail() when an email
// is actually opened.
//
// Counting happens inside Postgres — the query returns one integer per row, not
// the JSON itself.
//
// It counts occurrences of the `"filename"` key rather than doing the obvious
// json_array_length(attachments::json), because the column is text and the cast
// throws on any row that isn't valid JSON — verified: a single legacy row holding
// non-JSON text aborts the entire query, which would drop the attachment badge
// from every email on the page, not just that one. String counting can't throw,
// and every row this app writes goes through JSON.stringify of an
// EmailAttachment[], where that key appears exactly once per attachment.
async function attachAttachmentCounts(summaries: EmailSummary[], account: string): Promise<void> {
  const ids = summaries.map((s) => s.emailId);
  if (ids.length === 0) return;
  let counts: { emailId: string; n: number }[];
  try {
    counts = await prisma.$queryRaw<{ emailId: string; n: number }[]>(Prisma.sql`
      SELECT "emailId",
             (length("attachments") - length(replace("attachments", '"filename"', ''))) / length('"filename"') AS n
      FROM email_summaries
      WHERE "account" = ${account}
        AND "emailId" IN (${Prisma.join(ids)})
        AND "attachments" IS NOT NULL
    `);
  } catch (err) {
    console.warn("attachAttachmentCounts: count query failed, list will render without attachment badges —", err instanceof Error ? err.message : err);
    return;
  }
  const byId = new Map(counts.map((c) => [c.emailId, Number(c.n)]));
  for (const s of summaries) {
    const n = byId.get(s.emailId) ?? 0;
    s.attachments = n > 0
      ? Array.from({ length: n }, () => ({ filename: "", contentType: "", size: 0, data: "" }))
      : undefined;
  }
}

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

  const summaries = rows.map((s) => toEmailSummary({ ...s, body: null, htmlBody: null, attachments: null }));
  await attachAttachmentCounts(summaries, account);

  return { summaries, total, page, pageSize };
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

// How many raw, not-yet-summarized emails this account has — drives the
// "summarize pending" progress loop.
export async function countPendingSummaries(account: string): Promise<number> {
  return prisma.emailSummary.count({ where: { account, summarized: false } });
}

// Fetch up to `limit` pending (summarized=false) emails as EmailMessage-shaped
// objects ready for summarizeEmails() — includes the stored body/attachments so
// no IMAP round-trip is needed. Newest first, so the most relevant mail gets
// summaries soonest.
export async function getPendingEmails(
  account: string,
  limit: number,
): Promise<Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText" | "htmlBody" | "attachments">[]> {
  const rows = await prisma.emailSummary.findMany({
    where: { account, summarized: false },
    orderBy: { date: "desc" },
    take: limit,
    select: { emailId: true, from: true, subject: true, date: true, body: true, htmlBody: true, attachments: true },
  });
  return rows.map((r) => ({
    id: r.emailId,
    from: r.from,
    subject: r.subject,
    date: r.date,
    fullText: r.body ?? "",
    htmlBody: r.htmlBody ?? undefined,
    attachments: r.attachments
      ? (() => { try { return JSON.parse(r.attachments!) as EmailAttachment[]; } catch { return undefined; } })()
      : undefined,
  }));
}

// getExistingEmailIds/getSummariesByIds lived here to support the old sync:
// download a 50-message window, ask which ids were already stored, discard the
// duplicates, then return the whole window to the client. The UID watermark
// means nothing already-seen is downloaded in the first place, so both are gone.

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

// ─── IMAP sync watermark ────────────────────────────────────────────────────

// Stored as BigInt (32-bit unsigned UIDs overflow Postgres int4) but handed
// around as numbers — the values stay far below 2^53, so the round-trip is lossless.
export async function getMailboxCursor(account: string): Promise<MailboxCursor | null> {
  const row = await prisma.mailboxSync.findUnique({ where: { account } });
  return row
    ? { uidValidity: Number(row.uidValidity), lastSeenUid: Number(row.lastSeenUid) }
    : null;
}

export async function setMailboxCursor(account: string, cursor: MailboxCursor): Promise<void> {
  await prisma.mailboxSync.upsert({
    where: { account },
    update: { uidValidity: BigInt(cursor.uidValidity), lastSeenUid: BigInt(cursor.lastSeenUid) },
    create: { account, uidValidity: BigInt(cursor.uidValidity), lastSeenUid: BigInt(cursor.lastSeenUid) },
  });
}

// Forgets where the sync got to, so the next one re-reads the whole mailbox.
// Used by the clean-rebuild path (and whenever the server changes uidValidity).
export async function resetMailboxCursor(account: string): Promise<void> {
  await prisma.mailboxSync.deleteMany({ where: { account } });
}

export async function clearCache(account: string): Promise<void> {
  // The watermark has to go with the rows: leaving it behind would tell the next
  // sync everything was already downloaded, and a cleared mailbox would stay empty.
  await prisma.$transaction([
    prisma.emailSummary.deleteMany({ where: { account } }),
    prisma.mailboxSync.deleteMany({ where: { account } }),
  ]);
}
