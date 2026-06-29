import Groq from "groq-sdk";
import { extractPdfText } from "@/lib/pdf";
import type {
  EmailMessage, EmailSummary, SummaryLength,
  Category, Priority, ActionRequired, Sentiment,
  HiringCriteria, CandidateEvaluation,
} from "./types";

let _client: Groq | null = null;
function getClient(): Groq {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

const MAX_TOKENS: Record<SummaryLength, number> = { short: 1500, medium: 2000, long: 3000 };
const BODY_LIMIT = 400;  // chars per email in the batch prompt
const CHUNK_SIZE = 10;   // emails per API call

const VALID_SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];
const VALID_CATEGORIES: Category[] = ["Hiring", "Client Support", "Sales", "Finance", "Internal", "Marketing", "Technical", "General"];
const VALID_PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];
const VALID_ACTIONS: ActionRequired[] = ["Yes", "No"];

function buildBatchPrompt(
  emails: Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText">[],
  length: SummaryLength,
  attachmentTexts?: Map<string, string[]>
): string {
  const sentences = length === "short" ? "2-3" : length === "medium" ? "3-4" : "5-6";

  const emailBlocks = emails.map((e, i) => {
    const body = e.fullText.slice(0, BODY_LIMIT) + (e.fullText.length > BODY_LIMIT ? "..." : "");
    const texts = attachmentTexts?.get(e.id);
    const attachmentSection = texts?.length
      ? "\n" + texts.map((t, j) => `Attachment ${j + 1} content: ${t}`).join("\n")
      : "";
    return `--- Email ${i + 1} ---
ID: ${e.id}
From: ${e.from}
Subject: ${e.subject}
Body: ${body}${attachmentSection}`;
  }).join("\n\n");

  return `You are analyzing business emails for a company dashboard. Analyze ALL emails below and respond ONLY with a valid JSON array — no markdown, no code blocks.

${emailBlocks}

Return exactly this JSON array with one object per email in the same order:
[
  {
    "emailId": "<the ID from the email block>",
    "summary": "${sentences}-sentence plain-English summary",
    "keyPoints": ["key point 1", "key point 2", "key point 3"],
    "sentiment": "positive|neutral|negative",
    "category": "Hiring|Client Support|Sales|Finance|Internal|Marketing|Technical|General",
    "priority": "Critical|High|Medium|Low",
    "actionRequired": "Yes|No",
    "purpose": "short label e.g. Job Application, Meeting Request, Invoice, Newsletter"
  }
]

Category rules: Hiring=resumes/applications, Client Support=customer issues, Sales=proposals/leads, Finance=invoices/payments, Internal=team comms/HR, Marketing=campaigns/promos, Technical=system alerts/IT, General=everything else
Priority rules: Critical=server down/urgent legal, High=client awaiting reply/urgent meetings, Medium=standard correspondence, Low=newsletters/notifications
actionRequired: Yes=needs human response/action, No=informational only`;
}

function safeParseJSON(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned);
}

async function summarizeChunk(
  emails: Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText" | "htmlBody" | "attachments">[],
  summaryLength: SummaryLength
): Promise<EmailSummary[]> {
  // Extract text from PDF attachments in parallel before building the prompt
  const attachmentTexts = new Map<string, string[]>();
  await Promise.all(
    emails.map(async (e) => {
      if (!e.attachments?.length) return;
      const texts = await Promise.all(
        e.attachments.map((a) =>
          extractPdfText(a.data).catch(() => "")
        )
      );
      const nonEmpty = texts.filter(Boolean);
      if (nonEmpty.length) attachmentTexts.set(e.id, nonEmpty);
    })
  );

  const message = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: MAX_TOKENS[summaryLength],
    messages: [{ role: "user", content: buildBatchPrompt(emails, summaryLength, attachmentTexts) }],
  });

  const text = message.choices[0]?.message?.content;
  if (!text) throw new Error("No text in response");

  const parsed: Record<string, unknown>[] = safeParseJSON(text);
  const emailMap = new Map(emails.map((e) => [e.id, e]));

  return parsed.map((item) => {
    const emailId = String(item.emailId ?? "");
    const original = emailMap.get(emailId);
    return {
      emailId,
      from: original?.from ?? "",
      subject: original?.subject ?? "",
      date: original?.date ?? "",
      body: original?.fullText ?? "",
      htmlBody: original?.htmlBody ?? undefined,
      attachments: original?.attachments,
      summary: String(item.summary ?? ""),
      keyPoints: Array.isArray(item.keyPoints) ? (item.keyPoints as string[]).slice(0, 5) : [],
      sentiment: VALID_SENTIMENTS.includes(item.sentiment as Sentiment) ? (item.sentiment as Sentiment) : "neutral",
      category: VALID_CATEGORIES.includes(item.category as Category) ? (item.category as Category) : "General",
      priority: VALID_PRIORITIES.includes(item.priority as Priority) ? (item.priority as Priority) : "Medium",
      actionRequired: VALID_ACTIONS.includes(item.actionRequired as ActionRequired) ? (item.actionRequired as ActionRequired) : "No",
      purpose: String(item.purpose ?? "General Email"),
      status: "New",
      fetchedAt: new Date().toISOString(),
    };
  });
}

export async function summarizeEmails(
  emails: Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText" | "htmlBody" | "attachments">[],
  summaryLength: SummaryLength
): Promise<EmailSummary[]> {
  if (emails.length === 0) return [];

  const results: EmailSummary[] = [];
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    const chunk = emails.slice(i, i + CHUNK_SIZE);
    const summaries = await summarizeChunk(chunk, summaryLength);
    results.push(...summaries);
  }
  return results;
}

export async function evaluateCandidate(
  emailSummary: string,
  keyPoints: string[],
  subject: string,
  criteria: HiringCriteria
): Promise<CandidateEvaluation> {
  const prompt = `You are evaluating a job candidate for the position: ${criteria.position}

Email Subject: ${subject}
Email Summary: ${emailSummary}
Key Points: ${keyPoints.join("; ")}

Mandatory Requirements: ${criteria.mandatory.join(", ")}
Optional (Nice to Have): ${criteria.optional.join(", ")}

Analyze whether this candidate meets the requirements. Respond ONLY with valid JSON:
{
  "candidateName": "extracted name or 'Unknown Candidate'",
  "matchScore": 0-100,
  "recommendation": "Yes|No",
  "reasoning": "2-3 sentence explanation of match score and recommendation"
}`;

  const message = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.choices[0]?.message?.content;
  if (!text) throw new Error("No text in response");

  return safeParseJSON(text) as CandidateEvaluation;
}
