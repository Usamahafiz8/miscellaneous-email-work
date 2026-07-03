import OpenAI from "openai";
import { extractPdfText } from "@/lib/pdf";
import type {
  EmailMessage, EmailSummary, SummaryLength,
  Category, Priority, ActionRequired, Sentiment,
  HiringCriteria, CandidateEvaluation,
  ParsedJobRequirements, JobMatchResult, EmploymentDetails,
} from "./types";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
    _client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
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
      : "\nAttachments: none";
    return `--- Email ${i + 1} ---
ID: ${e.id}
From: ${e.from}
Subject: ${e.subject}
Body: ${body}${attachmentSection}`;
  }).join("\n\n");

  const hasAttachments = attachmentTexts && attachmentTexts.size > 0;
  const attachmentSummaryField = hasAttachments
    ? `\n    "attachmentSummary": "ONLY for emails whose block above contains an 'Attachment N content:' line: extract structured info from THAT attachment text as § bullet lines. Format: '§ Label: Value'. Include these sections (omit if no data): § Document Type, § Name, § Current Role, § Total Experience, § Work History (Company — Role, Year–Year per entry), § Technologies & Skills (comma list), § Education (Degree — University — Year), § Key Achievements, § Other Details. Be specific — real names, companies, years, tech stacks. Output only the § lines, nothing else. For any email block that says 'Attachments: none', you MUST set attachmentSummary to null — never fabricate or infer attachment content from the email body or subject, even if the body mentions an attached CV/resume.",`
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
    "candidateProfile": {"name": "...", "role": "...", "experience": "...", "skills": ["..."], "education": "...", "achievements": "...", "employmentStatus": "...", "noticePeriod": "...", "location": "...", "employmentType": "..."} or null,
  }
]

Category rules: Hiring=resumes/applications, Client Support=customer issues, Sales=proposals/leads, Finance=invoices/payments, Internal=team comms/HR, Marketing=campaigns/promos, Technical=system alerts/IT, General=everything else
Priority rules: Critical=server down/urgent legal, High=client awaiting reply/urgent meetings, Medium=standard correspondence, Low=newsletters/notifications
actionRequired: Yes=needs human response/action, No=informational only
keyPoints rules: Extract the most important, specific facts. For hiring emails: years of experience, skills, role applied for, education, notable achievements, availability, expected salary. For other emails: action items, deadlines, amounts, decisions, people mentioned. Each point must be a complete, self-contained fact (not vague like "good candidate"). Aim for 5 points minimum.
attachmentSummary: Only for emails whose block includes an "Attachment N content:" line. Must begin with "In this PDF, we have a [resume/invoice/CV/report/etc.] that contains:" and then describe the actual content of THAT attachment text — candidate experience, skills, education, salary expectations, company names, dates, figures, totals, decisions — whatever is present in the PDF text. Be specific and factual, and base it strictly on the attachment text, never on the email body or subject. Set to null if the email's block says "Attachments: none" — do not guess or fabricate.
candidateProfile: ONLY for emails you categorized as Hiring. Extract from whichever source has real candidate data — the attachment text if present, otherwise the email body itself (a body-only job application still counts). Fill only fields with real, specific data (real name, real skill names, real years) — omit/null a field rather than guess. Set the entire object to null for non-Hiring emails. Never fabricate from the subject line alone. Also extract, when mentioned: employmentStatus (e.g. Currently Employed/Unemployed/serving notice), noticePeriod (e.g. Immediate, 30 days), location (city/country or remote), employmentType (Full-time/Contract/Part-time). Omit any of these four not mentioned rather than guessing.`;
}

function safeParseJSON(text: string): Record<string, unknown>[] {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error(`AI returned non-array JSON: ${typeof parsed}`);
  return parsed as Record<string, unknown>[];
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
    const profile = item.candidateProfile && typeof item.candidateProfile === "object"
      ? item.candidateProfile as Record<string, unknown>
      : null;
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
      stage: "New",
      tags: [],
      candidateName: profile?.name ? String(profile.name) : undefined,
      candidateRole: profile?.role ? String(profile.role) : undefined,
      candidateExperience: profile?.experience ? String(profile.experience) : undefined,
      candidateSkills: Array.isArray(profile?.skills) ? (profile!.skills as string[]).map(String) : [],
      candidateEducation: profile?.education ? String(profile.education) : undefined,
      candidateAchievements: profile?.achievements ? String(profile.achievements) : undefined,
      candidateEmploymentStatus: profile?.employmentStatus ? String(profile.employmentStatus) : undefined,
      candidateNoticePeriod: profile?.noticePeriod ? String(profile.noticePeriod) : undefined,
      candidateLocation: profile?.location ? String(profile.location) : undefined,
      candidateEmploymentType: profile?.employmentType ? String(profile.employmentType) : undefined,
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

  // Sequential processing — avoids sending 6+ parallel AI requests that each hold open connections,
  // which causes the total request to blow past proxy/serverless timeouts.
  const results: EmailSummary[][] = [];
  for (const chunk of chunks) {
    results.push(await summarizeChunk(chunk, summaryLength));
  }
  return results.flat();
}

export async function summarizePdfAttachment(
  subject: string,
  from: string,
  pdfTexts: string[]
): Promise<string | null> {
  const prompt = `You are extracting structured information from a PDF attachment. Be specific and factual — only include fields that have real data in the PDF.

Email Subject: ${subject}
From: ${from}
PDF Content:
${pdfTexts.map((t, i) => `Attachment ${i + 1}:\n${t.slice(0, 6000)}`).join("\n\n")}

Extract and format the key information as labeled bullet points exactly like this (omit any section that has no data):

§ Document Type: [Resume / CV / Invoice / Report / Contract / etc.]
§ Name: [Full name of the person if resume/CV]
§ Current Role: [Most recent or current job title]
§ Total Experience: [e.g. "8+ years in full-stack development"]
§ Work History: [Company Name — Role (Year–Year), Company Name — Role (Year–Year), ...]
§ Technologies & Skills: [comma-separated list of tools, languages, frameworks]
§ Education: [Degree — University — Year]
§ Key Achievements: [notable accomplishments, awards, metrics]
§ Other Details: [salary expectations, availability, location, visa status, or for invoices: total amount, due date, items]

Rules:
- Be specific. Write real names, real companies, real years, real technologies — not vague descriptions.
- For each work history entry include the company name, role, and dates if available.
- For technologies list everything mentioned: languages, frameworks, databases, tools, cloud platforms.
- If this is not a resume (e.g. invoice, contract, report), adapt the sections to what makes sense for that document type.
- Respond ONLY with the § bullet lines, nothing else.`;

  const message = await getClient().chat.completions.create({
    model: "meta-llama/llama-3.3-70b-instruct",
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  return message.choices[0]?.message?.content?.trim() ?? null;
}

export interface CandidateProfile {
  name?: string;
  role?: string;
  experience?: string;
  skills: string[];
  education?: string;
  achievements?: string;
}

// One-off backfill path (see POST /api/hiring/backfill-profile): extracts the same
// structured fields as buildBatchPrompt's candidateProfile, but for a hiring email
// that has no PDF attachment at all — body text is the only source available.
export async function extractCandidateProfileFromBody(
  subject: string,
  from: string,
  body: string
): Promise<CandidateProfile | null> {
  const prompt = `This is a job application email with no resume attachment — the candidate's info is only in the email body below. Extract whatever real candidate details are present.

Email Subject: ${subject}
From: ${from}
Body: ${body.slice(0, 3000)}

Respond ONLY with valid JSON, omitting any field with no real data:
{"name": "...", "role": "...", "experience": "...", "skills": ["..."], "education": "...", "achievements": "..."}
If there is no real candidate data in this email at all, respond with: null`;

  const message = await getClient().chat.completions.create({
    model: "meta-llama/llama-3.3-70b-instruct",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.choices[0]?.message?.content?.trim();
  if (!text || text === "null") return null;
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      name: parsed.name ? String(parsed.name) : undefined,
      role: parsed.role ? String(parsed.role) : undefined,
      experience: parsed.experience ? String(parsed.experience) : undefined,
      skills: Array.isArray(parsed.skills) ? (parsed.skills as string[]).map(String) : [],
      education: parsed.education ? String(parsed.education) : undefined,
      achievements: parsed.achievements ? String(parsed.achievements) : undefined,
    };
  } catch {
    return null;
  }
}

// Parses a raw pasted job description into structured hiring requirements,
// for the /jobs page's "Extract Requirements" action.
export async function parseJobDescription(jobDescriptionText: string): Promise<ParsedJobRequirements | null> {
  const prompt = `Extract structured hiring requirements from this job description.

Job Description: ${jobDescriptionText.slice(0, 6000)}

Respond ONLY with valid JSON, omitting any field with no real data:
{"minExperienceYears": number, "maxExperienceYears": number, "techStack": ["required tech stack, tools, and skills, all in one list"], "requiredEmploymentStatus": "...", "requiredNoticePeriod": "...", "requiredLocation": "...", "requiredEmploymentType": "...", "otherCriteria": "any other important hiring criteria not captured above"}
If there is no real hiring content in this text at all, respond with: null`;

  const message = await getClient().chat.completions.create({
    model: "meta-llama/llama-3.3-70b-instruct",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.choices[0]?.message?.content?.trim();
  if (!text || text === "null") return null;
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      minExperienceYears: typeof parsed.minExperienceYears === "number" ? parsed.minExperienceYears : undefined,
      maxExperienceYears: typeof parsed.maxExperienceYears === "number" ? parsed.maxExperienceYears : undefined,
      techStack: Array.isArray(parsed.techStack) ? (parsed.techStack as string[]).map(String) : [],
      requiredEmploymentStatus: parsed.requiredEmploymentStatus ? String(parsed.requiredEmploymentStatus) : undefined,
      requiredNoticePeriod: parsed.requiredNoticePeriod ? String(parsed.requiredNoticePeriod) : undefined,
      requiredLocation: parsed.requiredLocation ? String(parsed.requiredLocation) : undefined,
      requiredEmploymentType: parsed.requiredEmploymentType ? String(parsed.requiredEmploymentType) : undefined,
      otherCriteria: parsed.otherCriteria ? String(parsed.otherCriteria) : undefined,
    };
  } catch {
    return null;
  }
}

export interface CandidateMatchInput {
  candidateName?: string;
  candidateRole?: string;
  candidateExperience?: string;
  candidateSkills: string[];
  candidateEmploymentStatus?: string;
  candidateNoticePeriod?: string;
  candidateLocation?: string;
  candidateEmploymentType?: string;
  subject: string;
  summary: string;
  keyPoints: string[];
}

// Scores one candidate against a job's requirements. Missing candidate fields
// are UNKNOWN, never treated as a mismatch — the prompt says so explicitly.
// Wrapped in try/catch (unlike evaluateCandidate) since this runs unattended
// in POST /api/jobs/[id]/scan's bulk loop — one bad response must not abort the scan.
export async function matchCandidateToJob(
  candidate: CandidateMatchInput,
  job: ParsedJobRequirements & { title: string }
): Promise<JobMatchResult | null> {
  try {
    const fmt = (v?: string | null) => (v && v.trim() ? v : "Not specified");
    const prompt = `You are matching a job candidate against a job posting. Missing/unspecified candidate details are UNKNOWN, not a mismatch — never reduce the score just because a field wasn't extracted.

JOB: ${job.title}
Required experience: ${job.minExperienceYears ?? "not specified"}${job.maxExperienceYears ? `–${job.maxExperienceYears}` : "+"} years
Required tech stack & skills: ${job.techStack.join(", ") || "none specified"}
Required employment status: ${fmt(job.requiredEmploymentStatus)}
Required notice period: ${fmt(job.requiredNoticePeriod)}
Required location: ${fmt(job.requiredLocation)}
Required employment type: ${fmt(job.requiredEmploymentType)}
Other criteria: ${fmt(job.otherCriteria)}

CANDIDATE:
Name: ${fmt(candidate.candidateName)} · Role: ${fmt(candidate.candidateRole)} · Experience: ${fmt(candidate.candidateExperience)}
Skills: ${candidate.candidateSkills.join(", ") || "Not specified"}
Employment status: ${fmt(candidate.candidateEmploymentStatus)} · Notice period: ${fmt(candidate.candidateNoticePeriod)}
Location: ${fmt(candidate.candidateLocation)} · Employment type: ${fmt(candidate.candidateEmploymentType)}
Email subject: ${candidate.subject}
Email summary: ${candidate.summary}
Key points: ${candidate.keyPoints.join("; ")}

Respond ONLY with valid JSON:
{"matchScore": 0-100, "recommendation": "Yes|No", "reasoning": "2-3 sentence explanation"}`;

    const message = await getClient().chat.completions.create({
      model: "meta-llama/llama-3.3-70b-instruct",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.choices[0]?.message?.content;
    if (!text) return null;
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const matchScore = typeof parsed.matchScore === "number" ? Math.max(0, Math.min(100, Math.round(parsed.matchScore))) : 0;
    return {
      matchScore,
      recommendation: parsed.recommendation === "Yes" ? "Yes" : "No",
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return null;
  }
}

export async function extractEmploymentDetails(subject: string, from: string, sourceText: string): Promise<EmploymentDetails | null> {
  const prompt = `Extract employment/logistics details for this job candidate from the text below, if mentioned.

Email Subject: ${subject}
From: ${from}
Text: ${sourceText.slice(0, 4000)}

Respond ONLY with valid JSON, omitting any field with no real data:
{"employmentStatus": "e.g. Currently Employed, Unemployed, serving notice", "noticePeriod": "e.g. Immediate, 30 days", "location": "city/country or remote", "employmentType": "Full-time, Contract, Part-time"}
If none of these are mentioned at all, respond with: null`;

  const message = await getClient().chat.completions.create({
    model: "meta-llama/llama-3.3-70b-instruct",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.choices[0]?.message?.content?.trim();
  if (!text || text === "null") return null;
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      employmentStatus: parsed.employmentStatus ? String(parsed.employmentStatus) : undefined,
      noticePeriod: parsed.noticePeriod ? String(parsed.noticePeriod) : undefined,
      location: parsed.location ? String(parsed.location) : undefined,
      employmentType: parsed.employmentType ? String(parsed.employmentType) : undefined,
    };
  } catch {
    return null;
  }
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

  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned) as CandidateEvaluation;
}
