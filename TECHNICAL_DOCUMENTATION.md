# MailAI — Technical Implementation Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Database Layer](#5-database-layer)
6. [Email Fetching — IMAP](#6-email-fetching--imap)
7. [AI Summarization Pipeline](#7-ai-summarization-pipeline)
8. [PDF Attachment Processing](#8-pdf-attachment-processing)
9. [API Routes](#9-api-routes)
10. [Frontend Components](#10-frontend-components)
11. [State Management](#11-state-management)
12. [Hiring Evaluation Module](#12-hiring-evaluation-module)
13. [Environment Configuration](#13-environment-configuration)
14. [Deployment](#14-deployment)

---

## 1. Project Overview

MailAI is a Next.js web application that connects to a company email account via IMAP, fetches emails, runs them through an AI model to generate structured summaries, and presents everything in a dashboard. The key insight is that AI runs **once per email** — results are stored in PostgreSQL and served from cache on every subsequent load, so page loads are instant regardless of inbox size.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Database | PostgreSQL (Neon serverless) |
| ORM | Prisma 7 with `@prisma/adapter-neon` |
| AI Model | Llama 3.3 70B via OpenRouter API |
| Email Protocol | IMAP (`imap` npm package) |
| Email Parsing | `mailparser` |
| PDF Extraction | `unpdf` |
| Deployment | Vercel |

---

## 3. Project Structure

```
Email Summarizer Tool/
├── app/
│   ├── layout.tsx              — Root HTML shell, Inter font, metadata
│   ├── page.tsx                — Entry point, renders <Dashboard />
│   ├── globals.css             — Tailwind base styles
│   ├── components/
│   │   ├── Dashboard.tsx       — App root: all state, routing, API calls
│   │   ├── Sidebar.tsx         — Collapsible dark sidebar navigation
│   │   ├── DashboardHome.tsx   — Home view: daily digest + analytics
│   │   ├── InboxView.tsx       — Tabular inbox with filters + slide-over
│   │   ├── HiringView.tsx      — Hiring table + criteria + evaluation
│   │   ├── EmailInsightsPanel.tsx — Structured AI insight renderer
│   │   ├── AnalyticsView.tsx   — (kept on disk, merged into Dashboard)
│   │   ├── PdfViewer.tsx       — In-panel PDF viewer
│   │   ├── SummaryCard.tsx     — Legacy card component
│   │   ├── SummaryList.tsx     — Legacy grid component
│   │   ├── ConfigPanel.tsx     — IMAP credential form
│   │   ├── ProviderSelector.tsx — Gmail/Outlook/Custom picker
│   │   ├── ErrorAlert.tsx      — Dismissible error banner
│   │   └── LoadingState.tsx    — Skeleton loaders
│   └── api/
│       ├── email/
│       │   ├── process/route.ts    — Main sync endpoint (GET + POST)
│       │   ├── connect/route.ts    — IMAP connection test
│       │   ├── fetch/route.ts      — Legacy direct fetch
│       │   ├── summarize/route.ts  — Direct summarization
│       │   ├── resync/route.ts     — Re-run AI on one email
│       │   └── pdf-summaries/route.ts — Batch PDF extraction
│       ├── summaries/route.ts      — DB read, status patch, clear
│       └── hiring/
│           └── evaluate/route.ts   — AI candidate evaluation
├── lib/
│   ├── types.ts        — All TypeScript interfaces and type aliases
│   ├── imap.ts         — IMAP client, email fetch, attachment extraction
│   ├── claude.ts       — AI prompt construction and API calls
│   ├── pdf.ts          — PDF text extraction via unpdf
│   ├── cache.ts        — Prisma DB operations (read, write, clear)
│   ├── db.ts           — Prisma client singleton with Neon adapter
│   ├── utils.ts        — Date formatting, sender parsing, avatar colours
│   └── validation.ts   — IMAP config validation, HTML sanitizer
├── hooks/
│   ├── useEmailSummarizer.ts — Form state for manual IMAP config
│   └── useCacheStatus.ts     — Cache monitoring hook
├── prisma/
│   └── schema.prisma   — Single EmailSummary model
├── .env.local          — Secrets (never committed)
├── next.config.mjs     — External packages for server components
├── vercel.json         — Per-route function timeout overrides
└── tailwind.config.ts  — Design tokens
```

---

## 4. Architecture & Data Flow

### High-level flow

```
Browser → Next.js API Route → IMAP Server (Purelymail)
                           ↘ PostgreSQL (Neon)
                           ↘ OpenRouter AI (Llama 3.3 70B)
```

### Startup sequence (on page load)

```
1. Dashboard mounts
2. useEffect → GET /api/email/process?offset=0
3. API reads up to 50 rows from DB (ordered by date DESC)
4. Returns { summaries[], totalCount }
5. UI renders immediately with cached data
```

### Sync sequence (user clicks "Sync")

```
1. POST /api/email/process { offset: 0 }
2. Connect to IMAP, open INBOX, read total message count
3. Compute page range: newest-first, 50 emails
4. Fetch full RFC 2822 messages → mailparser
5. Extract body text, HTML, PDF attachments
6. Query DB: which of these email IDs already exist?
7. For NEW emails only → run AI summarization (batched, 8 at a time)
8. Upsert new summaries into DB
9. Return all summaries for this page (mix of cached + new)
```

### Key design decisions

- **Deduplication at the DB level** — `getExistingEmailIds()` queries the DB before calling AI, so re-syncing never re-processes an email that already has a summary. AI cost is paid once per email, forever.
- **Optimistic status updates** — When a user changes an email's status (New → Open → Closed), the UI updates instantly via in-memory `statusOverrides`, and a `PATCH /api/summaries` fires in the background to persist. If the write fails, the next page load corrects the state.
- **Chunked AI calls** — Emails are sent to the AI in chunks of 8. All chunks run in parallel (`Promise.all`), so a 40-email batch takes as long as the slowest single 8-email chunk, not 5× that.
- **Pagination** — Both IMAP and DB queries use offset-based pagination (50 per page). The UI shows a "Load more" button that fetches the next page without replacing what's already loaded.

---

## 5. Database Layer

### Schema (`prisma/schema.prisma`)

```prisma
model EmailSummary {
  emailId           String   @id          -- Message ID from IMAP
  from              String                -- Raw "From" header
  subject           String
  date              String                -- ISO 8601 string
  summary           String                -- AI-generated paragraph summary
  keyPoints         String[]              -- Array of specific extracted facts
  sentiment         String                -- "positive" | "neutral" | "negative"
  category          String                -- One of 8 categories
  priority          String                -- "Critical" | "High" | "Medium" | "Low"
  actionRequired    String                -- "Yes" | "No"
  purpose           String                -- Short label: "Job Application" etc.
  body              String?               -- Plain text body (first 8000 chars)
  htmlBody          String?               -- HTML body (first 50 000 chars)
  attachments       String?               -- JSON: EmailAttachment[]
  attachmentSummary String?               -- Structured § section text from PDF AI
  status            String   @default("New")  -- "New" | "Open" | "Closed"
  fetchedAt         DateTime @default(now())

  @@map("email_summaries")
}
```

### Key operations (`lib/cache.ts`)

| Function | What it does |
|---|---|
| `getCachedSummaries(limit, offset)` | Paginated read, ordered by `date DESC` |
| `getExistingEmailIds(ids[])` | Batch lookup — returns Set of known IDs |
| `getSummariesByIds(ids[])` | Ordered fetch matching a specific ID list |
| `cacheSummaries(summaries[])` | Upsert transaction — all rows in one round-trip |
| `clearCache()` | `deleteMany()` — wipes the entire table |

### Upsert behaviour

`cacheSummaries` uses Prisma's `$transaction` to run all upserts in a single DB round-trip. The `update` block only touches AI-generated fields (summary, keyPoints, sentiment, etc.), never the email metadata or status. This means re-processing an email updates its AI analysis without clobbering a user's status change.

---

## 6. Email Fetching — IMAP

**File:** `lib/imap.ts`

### Connection

```
config: { email, password, host, port }
→ new Imap({ tls: true, tlsOptions: { rejectUnauthorized: false } })
→ 10-second connection/auth timeout
→ Opens INBOX in read-only mode
```

### Pagination (newest-first)

IMAP sequence numbers are 1-based and go oldest→newest. To get page N of newest emails:

```
total = box.messages.total         // e.g. 347
end   = total - offset             // e.g. 347 - 50 = 297  (start of page 2)
start = end - pageSize + 1         // e.g. 297 - 50 + 1 = 248
range = "248:297"                  // IMAP sequence range
```

After fetching, messages are sorted by date DESC before returning, since IMAP delivery order isn't always chronological.

### Attachment limits

| Limit | Value |
|---|---|
| Per attachment | 5 MB |
| Total per email | 10 MB |
| Only extracted | PDFs (by MIME type or `.pdf` extension) |

Attachments are stored as base64 strings in the `attachments` JSON field.

### Email parsing

`mailparser.simpleParser()` handles the full RFC 2822 message:
- Extracts `text`, `html`, `from`, `subject`, `date`, `attachments`
- HTML body is sanitized and stored separately for in-panel rendering
- Plain text body is truncated to 8 000 chars for AI processing

---

## 7. AI Summarization Pipeline

**File:** `lib/claude.ts`  
**Model:** `meta-llama/llama-3.3-70b-instruct` via OpenRouter

### Batch prompt structure

Each API call processes up to 8 emails in a single prompt:

```
System: "You are analyzing business emails for a company dashboard..."

--- Email 1 ---
ID: <uuid>
From: sender@example.com
Subject: Re: Project Update
Body: <first 800 chars of text>
Attachment 1 content: <PDF text if present>

--- Email 2 ---
...

Return exactly this JSON array with one object per email:
[
  {
    "emailId": "...",
    "summary": "4-5 sentence summary",
    "keyPoints": ["fact 1", "fact 2", ...],
    "sentiment": "positive|neutral|negative",
    "category": "Hiring|Client Support|...",
    "priority": "Critical|High|Medium|Low",
    "actionRequired": "Yes|No",
    "purpose": "Job Application",
    "attachmentSummary": "§ Document Type: ...\n§ Name: ..."
  }
]
```

### Attachment summary format

When a PDF is present, the `attachmentSummary` field uses a structured `§` label format:

```
§ Document Type: Resume
§ Name: Jane Smith
§ Current Role: Senior React Developer at TechCorp (2022–present)
§ Total Experience: 7 years
§ Work History: TechCorp — Senior Dev (2022–present), StartupXYZ — Dev (2019–2022)
§ Technologies & Skills: React, TypeScript, Node.js, GraphQL, AWS, Docker
§ Education: B.Sc Computer Science — MIT — 2017
§ Key Achievements: Led team of 8, reduced load time by 65%
§ Other Details: Available immediately, based in London
```

The `§` prefix is used as a reliable parse delimiter in the frontend.

### Chunking and parallelism

```typescript
// lib/claude.ts — summarizeEmails()
const chunks = [];
for (let i = 0; i < emails.length; i += 8) {
  chunks.push(emails.slice(i, i + 8));
}
// All chunks run concurrently — wall-clock = slowest chunk
const results = await Promise.all(chunks.map(chunk => summarizeChunk(chunk, length)));
```

### PDF extraction before the batch call

For each email in the chunk, PDF attachments are decoded and text is extracted *before* the prompt is built. This means the AI sees the PDF content inline as part of the email block.

```typescript
// Extract text from all PDFs in parallel
await Promise.all(emails.map(async (e) => {
  if (!e.attachments?.length) return;
  const texts = await Promise.all(e.attachments.map(a => extractPdfText(a.data)));
  attachmentTexts.set(e.id, texts.filter(Boolean));
}));
// Then build prompt with attachment text injected into each email block
```

### Token budgets

| Summary length | Max tokens |
|---|---|
| short | 1 800 |
| medium | 2 400 |
| long | 3 200 |

Body text is capped at 800 chars per email inside the batch prompt to keep total prompt size manageable across 8 emails.

---

## 8. PDF Attachment Processing

**File:** `lib/pdf.ts`

```typescript
export async function extractPdfText(base64: string): Promise<string> {
  const { extractText } = await import("unpdf");
  const buffer = Buffer.from(base64, "base64");
  const { text } = await extractText(new Uint8Array(buffer));
  const clean = (Array.isArray(text) ? text.join(" ") : String(text))
    .replace(/\s+/g, " ").trim();
  return clean.length > 3000 ? clean.slice(0, 3000) + "..." : clean;
}
```

- Uses **dynamic import** for `unpdf` to avoid bundling issues with Next.js server components
- Text is cleaned (collapsed whitespace) and capped at 3 000 chars before being sent to AI
- Used in two places: inside `summarizeChunk` (during sync) and in `summarizePdfAttachment` (dedicated PDF Summaries button)

### Dedicated PDF Summaries button

`POST /api/email/pdf-summaries` runs *without* IMAP — it reads emails that already have `attachments` in the DB, re-extracts PDF text, and calls `summarizePdfAttachment()` which uses a more detailed single-document prompt focused on resume/invoice structure. Results are written back to `attachmentSummary` in the DB.

This lets you improve PDF summaries for existing emails without re-syncing from IMAP.

---

## 9. API Routes

### `GET /api/email/process`

Loads cached emails from DB, no external calls.

**Query params:** `offset` (default 0)  
**Returns:** `{ success, summaries[], emailCount, totalCount, offset, fromCache: true }`

### `POST /api/email/process`

Full IMAP sync. Reads credentials from env, fetches emails, deduplicates, runs AI on new ones.

**Body:** `{ offset: number }`  
**Returns:** `{ success, summaries[], emailCount, newCount, totalCount, offset }`

### `POST /api/email/connect`

Tests IMAP credentials without fetching emails.

**Body:** `{ email, password, host, port }`  
**Returns:** `{ success, message }` or error

### `POST /api/email/resync`

Re-runs AI on a single email already in DB. Useful when AI quality improves or prompt changes.

**Body:** `{ emailId: string }`  
**Returns:** `{ success, summary }`

### `POST /api/email/pdf-summaries`

Scans all DB emails for PDF attachments and generates/updates `attachmentSummary` for each.

**Returns:** `{ success, processed, total }`

### `GET /api/summaries`

Direct DB read with pagination.

**Query params:** `limit` (max 100), `offset`  
**Returns:** `{ summaries[], total, limit, offset }`

### `PATCH /api/summaries`

Updates an email's status in DB.

**Body:** `{ emailId: string, status: "New" | "Open" | "Closed" }`  
**Returns:** `{ success }`

### `DELETE /api/summaries`

Wipes all rows from `email_summaries`. Used by "Re-sync All" button.

**Returns:** `{ success }`

### `POST /api/hiring/evaluate`

Runs AI evaluation of a candidate against hiring criteria.

**Body:** `{ summary, keyPoints[], subject, criteria: { position, mandatory[], optional[] } }`  
**Returns:** `{ success, evaluation: { candidateName, matchScore, recommendation, reasoning } }`

---

## 10. Frontend Components

### Dashboard.tsx — the state root

All application state lives here. Child components receive data and callbacks as props — no context, no external state library.

```typescript
State:
  summaries[]       — EmailSummary[] loaded from DB
  statusOverrides   — Map<emailId, EmailStatus> — optimistic UI state
  isLoading         — true while initial DB load is running
  isLoadingMore     — true while "Load more" is running
  isSyncing         — true while IMAP sync is running
  error             — string | null
  syncMessage       — success banner text
  sidebarCollapsed  — boolean
  nextOffset        — cursor for next "Load more" page
  totalCount        — total emails in DB (from API)

Key callbacks:
  loadFromDB(offset)  — GET /api/email/process
  syncEmails()        — POST /api/email/process
  clearAndResync()    — DELETE /api/summaries → POST /api/email/process
  loadMore()          — loadFromDB(nextOffset)
  handleStatusChange(emailId, status) — optimistic update + PATCH
```

The `enriched` array is a memoised merge of `summaries` and `statusOverrides`:

```typescript
const enriched = useMemo(
  () => summaries.map(s => ({ ...s, status: statusOverrides.get(s.emailId) ?? s.status })),
  [summaries, statusOverrides]
);
```

### InboxView.tsx — tabular inbox

Renders a sticky-header `<table>` with one row per email. All filtering and search is done client-side with `useMemo` over the `summaries` prop — no additional API calls for filtering.

**Columns:** Unread dot · Date · Sender · Subject · AI Summary · Category · Priority · Action Required · Status

Clicking a row opens a slide-over panel (`fixed top-0 right-0 h-full max-w-xl`) with a backdrop. The slide-over contains tabs: **AI Insights** (EmailInsightsPanel) and **Email** (raw HTML iframe or plain text).

Status dropdown in the table row calls `onStatusChange` directly, with `e.stopPropagation()` to prevent opening the slide-over.

### HiringView.tsx — candidate table

Same table pattern as InboxView. Extra columns: Match % · Recommendation · Evaluate button.

**Job Criteria panel** at the top collapses to save space. The three fields (Position, Must Have, Nice to Have) sit in a 3-column grid.

Candidates are sorted by:
1. AI-evaluated match score (highest first, if evaluated)
2. Keyword match count against mandatory requirements
3. Date (newest first)

Evaluate button calls `POST /api/hiring/evaluate` and updates local `evaluations` Map state without re-loading the whole list.

### EmailInsightsPanel.tsx — structured insight renderer

Handles two display modes for `attachmentSummary`:

**Structured mode** (when text contains `§` lines):
```
parseSections(text)
→ [{ label: "Work History", value: "TechCorp — Dev (2022–present)..." }, ...]
→ Each label gets a dedicated icon and colour
→ "Technologies & Skills" → rendered as chip badges (indigo rounded-full)
→ "Work History" / "Key Achievements" → rendered as bullet list
→ All others → plain text paragraph
```

**Fallback mode** (plain text, old format):
```
splitSentences(text)
→ Amber bullet list, one sentence per row
```

### DashboardHome.tsx — home view

Sections rendered top to bottom:
1. **Header** — greeting, date, sync button
2. **Daily Digest** — today-filtered stats + important emails needing attention
3. **Stat cards** — Total / Action Required / Hiring / High Priority (all-time)
4. **Recent Emails** — last 8 emails with priority dot and category badge
5. **By Category** — horizontal progress bars with count + percentage
6. **Priority Distribution** — 4-row bar chart (Critical → Low)
7. **Status + Sentiment** — donut ring for closed%, mini bars for sentiment
8. **Action Required** — single gradient bar with count/total

---

## 11. State Management

No external state library. Pattern is **prop drilling from Dashboard.tsx**.

```
Dashboard.tsx
├── Sidebar          ← active, onChange, counts
├── DashboardHome    ← enriched[], isLoading, onFetch, onNavigate
├── InboxView        ← enriched[], loading states, onFetch, onClearAndResync,
│                       onLoadMore, onStatusChange
└── HiringView       ← hiringEmails[], isLoading, onFetch
```

**Optimistic status updates** — `statusOverrides` Map is the single source of truth for UI-side status. The DB is the ground truth on next load. If a PATCH fails silently, the user sees the correct state until refresh — acceptable trade-off for instant UI response.

**Memoisation** — `enriched`, `hiringEmails`, `unreadCount` are all `useMemo` — they only recompute when `summaries` or `statusOverrides` change, not on every render.

---

## 12. Hiring Evaluation Module

### Criteria

Defined client-side in `HiringView` local state:
```typescript
{ position: string, mandatory: string[], optional: string[] }
```

### Client-side keyword pre-scoring

Before AI evaluation, candidates are sorted by a simple keyword match:

```typescript
const mandHits = criteria.mandatory
  .filter(r => emailText.includes(r.toLowerCase())).length;
const optHits = criteria.optional
  .filter(r => emailText.includes(r.toLowerCase())).length;
// Sort key: eval.matchScore > mandHits*10 + optHits > date
```

This gives instant ordering without an API call, so the most likely matches appear at the top as soon as criteria are set.

### AI evaluation prompt (`lib/claude.ts — evaluateCandidate`)

```
Position: Senior React Developer
Email Summary: <summary text>
Key Points: <keyPoints joined>
Mandatory: React, 5+ years, Next.js
Optional: TypeScript, Node.js

→ Returns JSON:
{
  "candidateName": "Jane Smith",
  "matchScore": 87,
  "recommendation": "Yes",
  "reasoning": "Candidate has 7 years React experience and has shipped production Next.js apps..."
}
```

Results are stored in component-local `Map<emailId, EvalState>` and displayed inline in the table row (match %) and in the slide-over panel (score ring + reasoning paragraph).

---

## 13. Environment Configuration

All secrets live in `.env.local` (Vercel project env in production):

```bash
# Email account
EMAIL_ADDRESS=your@email.com
EMAIL_PASSWORD=your-app-password
IMAP_HOST=imap.purelymail.com
IMAP_PORT=993

# AI
OPENROUTER_API_KEY=sk-or-...

# Database
DATABASE_URL=postgresql://...@...neon.tech/...

# Optional
SUMMARY_LENGTH=medium       # short | medium | long
```

`next.config.mjs` marks `imap`, `mailparser`, and `unpdf` as server-only external packages so Next.js doesn't try to bundle them for the browser:

```javascript
serverComponentsExternalPackages: ["imap", "mailparser", "unpdf"]
```

---

## 14. Deployment

Deployed on **Vercel** with Neon PostgreSQL.

### Function timeouts (`vercel.json`)

Default Vercel function timeout is 10s — not enough for IMAP + AI. These routes get extended limits:

```json
{
  "functions": {
    "app/api/email/fetch/route.ts":    { "maxDuration": 60 },
    "app/api/email/process/route.ts":  { "maxDuration": 60 },
    "app/api/email/summarize/route.ts":{ "maxDuration": 60 },
    "app/api/email/connect/route.ts":  { "maxDuration": 30 }
  }
}
```

### Build

```bash
prisma generate && next build
```

`prisma generate` must run before the build because Next.js imports Prisma client at compile time.

### Neon adapter

The Prisma client uses `@prisma/adapter-neon` instead of the default TCP driver. This is required because Vercel serverless functions use HTTP connections, not persistent TCP — Neon's HTTP adapter makes Prisma work in that environment.

```typescript
// lib/db.ts
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

The client is stored on `globalThis` to survive hot-reload in development without opening a new connection on every file save.
