import Anthropic from "@anthropic-ai/sdk";
import type {
  EmailMessage, EmailSummary, SummaryLength,
  Category, Priority, ActionRequired, Sentiment,
  HiringCriteria, CandidateEvaluation,
} from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TOKENS: Record<SummaryLength, number> = { short: 500, medium: 700, long: 1000 };

const VALID_SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];
const VALID_CATEGORIES: Category[] = ["Hiring", "Client Support", "Sales", "Finance", "Internal", "Marketing", "Technical", "General"];
const VALID_PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];
const VALID_ACTIONS: ActionRequired[] = ["Yes", "No"];

function buildSummaryPrompt(subject: string, from: string, body: string, length: SummaryLength): string {
  const sentences = length === "short" ? "2-3" : length === "medium" ? "3-4" : "5-6";
  return `You are an AI assistant analyzing business emails for a company dashboard. Analyze the email and respond ONLY with valid JSON (no markdown, no code blocks).

From: ${from}
Subject: ${subject}
Body:
${body}

Return exactly this JSON:
{
  "summary": "${sentences}-sentence plain-English summary",
  "keyPoints": ["key point 1", "key point 2", "key point 3"],
  "sentiment": "positive|neutral|negative",
  "category": "Hiring|Client Support|Sales|Finance|Internal|Marketing|Technical|General",
  "priority": "Critical|High|Medium|Low",
  "actionRequired": "Yes|No",
  "purpose": "short label e.g. Job Application, Meeting Request, Invoice, Newsletter"
}

Category rules: Hiring=resumes/applications, Client Support=customer issues, Sales=proposals/leads, Finance=invoices/payments, Internal=team comms/HR, Marketing=campaigns/promos, Technical=system alerts/IT, General=everything else
Priority rules: Critical=server down/urgent legal, High=client awaiting reply/urgent meetings, Medium=standard correspondence, Low=newsletters/notifications
actionRequired: Yes=needs human response/action, No=informational only`;
}

function safeParseJSON(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned);
}

export async function summarizeEmails(
  emails: Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText">[],
  summaryLength: SummaryLength
): Promise<EmailSummary[]> {
  const results: EmailSummary[] = [];

  for (const email of emails) {
    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: MAX_TOKENS[summaryLength],
        messages: [{ role: "user", content: buildSummaryPrompt(email.subject, email.from, email.fullText, summaryLength) }],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("No text in response");

      const parsed = safeParseJSON(textBlock.text);

      results.push({
        emailId: email.id,
        from: email.from,
        subject: email.subject,
        date: email.date,
        summary: parsed.summary ?? "",
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
        sentiment: VALID_SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : "neutral",
        category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "General",
        priority: VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority : "Medium",
        actionRequired: VALID_ACTIONS.includes(parsed.actionRequired) ? parsed.actionRequired : "No",
        purpose: parsed.purpose ?? "General Email",
        status: "New",
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      results.push({
        emailId: email.id, from: email.from, subject: email.subject, date: email.date,
        summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
        keyPoints: [], sentiment: "neutral", category: "General",
        priority: "Low", actionRequired: "No", purpose: "Unknown",
        status: "New", fetchedAt: new Date().toISOString(),
      });
    }
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

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text in response");

  return safeParseJSON(textBlock.text) as CandidateEvaluation;
}
