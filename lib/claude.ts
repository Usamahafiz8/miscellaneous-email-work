import OpenAI from "openai";
import { extractPdfText } from "@/lib/pdf";
import type {
  EmailMessage, EmailSummary, SummaryLength,
  Category, Priority, ActionRequired, Sentiment,
  HiringCriteria, CandidateEvaluation,
} from "./types";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _client;
}

const MAX_TOKENS: Record<SummaryLength, number> = { short: 1800, medium: 2400, long: 3200 };
const BODY_LIMIT = 800;  // chars per email in the batch prompt
const CHUNK_SIZE = 8;    // emails per API call

const VALID_SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];
const VALID_CATEGORIES: Category[] = ["Hiring", "Client Support", "Sales", "Finance", "Internal", "Marketing", "Technical", "General"];
const VALID_PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];
const VALID_ACTIONS: ActionRequired[] = ["Yes", "No"];

function buildBatchPrompt(
  emails: Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText">[],
  length: SummaryLength,
  attachmentTexts?: Map<string, string[]>
): string {
  const sentences = length === "short" ? "4-5" : length === "medium" ? "5-7" : "7-9";

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

  const hasAttachments = attachmentTexts && attachmentTexts.size > 0;
  const attachmentSummaryField = hasAttachments
    ? `\n    "attachmentSummary": "Start with 'In this PDF, we have a [document type] that contains:' then list the key contents, figures, candidate details, or important data found inside. 3-5 sentences. Null if no attachment.",`
    : `\n    "attachmentSummary": null,`;

  return `You are analyzing business emails for a company dashboard. Analyze ALL emails below and respond ONLY with a valid JSON array — no markdown, no code blocks.

${emailBlocks}

Return exactly this JSON array with one object per email in the same order:
[
  {
    "emailId": "<the ID from the email block>",
    "summary": "${sentences}-sentence plain-English summary of the email body",
    "keyPoints": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"],
    "sentiment": "positive|neutral|negative",
    "category": "Hiring|Client Support|Sales|Finance|Internal|Marketing|Technical|General",
    "priority": "Critical|High|Medium|Low",
    "actionRequired": "Yes|No",
    "purpose": "short label e.g. Job Application, Meeting Request, Invoice, Newsletter",${attachmentSummaryField}
  }
]

Category rules: Hiring=resumes/applications, Client Support=customer issues, Sales=proposals/leads, Finance=invoices/payments, Internal=team comms/HR, Marketing=campaigns/promos, Technical=system alerts/IT, General=everything else
Priority rules: Critical=server down/urgent legal, High=client awaiting reply/urgent meetings, Medium=standard correspondence, Low=newsletters/notifications
actionRequired: Yes=needs human response/action, No=informational only
keyPoints rules: Extract the most important, specific facts. For hiring emails: years of experience, skills, role applied for, education, notable achievements, availability, expected salary. For other emails: action items, deadlines, amounts, decisions, people mentioned. Each point must be a complete, self-contained fact (not vague like "good candidate"). Aim for 5 points minimum.
attachmentSummary: Must begin with "In this PDF, we have a [resume/invoice/CV/report/etc.] that contains:" and then describe the actual content — candidate experience, skills, education, salary expectations, company names, dates, figures, totals, decisions — whatever is present in the PDF text. Be specific and factual. Set to null if no attachment content was provided.`;
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
    model: "meta-llama/llama-3.3-70b-instruct",
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
      keyPoints: Array.isArray(item.keyPoints) ? (item.keyPoints as string[]).slice(0, 8) : [],
      sentiment: VALID_SENTIMENTS.includes(item.sentiment as Sentiment) ? (item.sentiment as Sentiment) : "neutral",
      category: VALID_CATEGORIES.includes(item.category as Category) ? (item.category as Category) : "General",
      priority: VALID_PRIORITIES.includes(item.priority as Priority) ? (item.priority as Priority) : "Medium",
      actionRequired: VALID_ACTIONS.includes(item.actionRequired as ActionRequired) ? (item.actionRequired as ActionRequired) : "No",
      purpose: String(item.purpose ?? "General Email"),
      attachmentSummary: item.attachmentSummary && item.attachmentSummary !== "null"
        ? String(item.attachmentSummary)
        : undefined,
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

  const chunks: typeof emails[] = [];
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    chunks.push(emails.slice(i, i + CHUNK_SIZE));
  }

  // All chunks run in parallel — wall-clock time = slowest single chunk, not sum of all
  const results = await Promise.all(chunks.map(chunk => summarizeChunk(chunk, summaryLength)));
  return results.flat();
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
    model: "meta-llama/llama-3.3-70b-instruct",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.choices[0]?.message?.content;
  if (!text) throw new Error("No text in response");

  return safeParseJSON(text) as CandidateEvaluation;
}
