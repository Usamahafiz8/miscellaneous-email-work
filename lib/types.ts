export interface IMAPConfig {
  email: string;
  password: string;
  host: string;
  port: number;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: string; // base64
}

export interface EmailMessage {
  id: string;
  // IMAP UID — stable per mailbox, used to advance the sync watermark so a sync
  // only ever downloads mail it hasn't seen (see MailboxSync / fetchNewEmailsByUid).
  // Absent on the legacy sequence-number fetch path.
  uid?: number;
  from: string;
  subject: string;
  date: string;
  text: string;
  fullText: string;
  htmlBody?: string;
  attachments?: EmailAttachment[];
}

export type SummaryLength = "short" | "medium" | "long";
export type Sentiment = "positive" | "neutral" | "negative";
export type Category = "Hiring" | "Client Support" | "Sales" | "Finance" | "Internal" | "Marketing" | "Technical" | "General";
export type Priority = "Critical" | "High" | "Medium" | "Low";
export type ActionRequired = "Yes" | "No";
export type EmailStatus = "New" | "Open" | "Closed";
export type Stage = "New" | "Shortlisted" | "Interviewing" | "Offer" | "Rejected" | "Hired";

export interface EmailSummary {
  emailId: string;
  from: string;
  subject: string;
  date: string;
  body?: string;
  htmlBody?: string;
  attachments?: EmailAttachment[];
  attachmentSummary?: string;
  summary: string;
  keyPoints: string[];
  sentiment: Sentiment;
  category: Category;
  priority: Priority;
  actionRequired: ActionRequired;
  purpose: string;
  status: EmailStatus;
  stage: Stage;
  tags: string[];
  candidateName?: string;
  candidateRole?: string;
  candidateExperience?: string;
  candidateSkills: string[];
  candidateEducation?: string;
  candidateAchievements?: string;
  candidateEmploymentStatus?: string;
  candidateNoticePeriod?: string;
  candidateLocation?: string;
  candidateEmploymentType?: string;
  fetchedAt?: string;
  // False for raw-synced emails whose AI summary hasn't been generated yet — the
  // LLM runs lazily the first time the email is opened. See lib/cache.ts.
  summarized?: boolean;
}

export interface HiringCriteria {
  position: string;
  mandatory: string[];
  optional: string[];
}

export interface CandidateEvaluation {
  candidateName: string;
  matchScore: number;
  recommendation: "Yes" | "No";
  reasoning: string;
}

export interface ParsedJobRequirements {
  minExperienceYears?: number;
  maxExperienceYears?: number;
  techStack: string[]; // combined tech stack & skills, one field
  requiredEmploymentStatus?: string;
  requiredNoticePeriod?: string;
  requiredLocation?: string;
  requiredEmploymentType?: string;
  otherCriteria?: string;
}

export interface JobPosting {
  id: string;
  title: string;
  jobDescription: string | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  techStack: string[];
  requiredEmploymentStatus: string | null;
  requiredNoticePeriod: string | null;
  requiredLocation: string | null;
  requiredEmploymentType: string | null;
  otherCriteria: string | null;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { matches: number };
}

export interface JobMatchResult {
  matchScore: number;
  recommendation: "Yes" | "No";
  reasoning: string;
}

// Deliberately NOT named "CandidateMatch" — @prisma/client already generates
// a CandidateMatch model type; colliding both under one name forces awkward
// aliasing anywhere a route needs both the DB row type and this client DTO.
export interface JobCandidateMatch {
  id: string;
  jobPostingId: string;
  emailId: string;
  matchScore: number;
  recommendation: "Yes" | "No";
  reasoning: string;
  matchedAt: string;
  emailSummary: {
    emailId: string; from: string; subject: string; date: string;
    candidateName: string | null; candidateRole: string | null; candidateExperience: string | null;
    candidateSkills: string[];
    candidateEmploymentStatus: string | null; candidateNoticePeriod: string | null;
    candidateLocation: string | null; candidateEmploymentType: string | null;
    stage: string; tags: string[];
  };
}

export interface EmploymentDetails {
  employmentStatus?: string;
  noticePeriod?: string;
  location?: string;
  employmentType?: string;
}

export interface ProcessEmailsRequest {
  email: string;
  password: string;
  host: string;
  port: number;
  maxEmails: number;
  summaryLength: SummaryLength;
}

export interface FetchEmailsResponse {
  success: boolean;
  emails: EmailMessage[];
  count: number;
}

export interface SummarizeRequest {
  emails: Pick<EmailMessage, "id" | "from" | "subject" | "date" | "fullText">[];
  summaryLength: SummaryLength;
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<string, string>>;
}

// IMAP (read) settings per provider — deliberately IMAP, never SMTP: this app
// only ever *reads* mail, so SMTP send settings (smtp.gmail.com:587, etc.) can
// never work here. Port 993 throughout because lib/imap.ts connects with
// implicit TLS; a plaintext/STARTTLS port like 143 or 587 fails the TLS
// handshake outright ("wrong version number").
export const IMAP_PROVIDERS = {
  purelymail: { label: "PurelyMail", host: "imap.purelymail.com", port: 993, domains: ["purelymail.com"], note: "" },
  gmail: {
    label: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    domains: ["gmail.com", "googlemail.com"],
    note: "Gmail rejects your normal password. Create an App Password at myaccount.google.com/apppasswords and use that here. IMAP must also be enabled in Gmail → Settings → Forwarding and POP/IMAP.",
  },
  outlook: {
    label: "Outlook / Hotmail",
    host: "outlook.office365.com",
    port: 993,
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    note: "Outlook may require an app password if two-step verification is on.",
  },
  yahoo: {
    label: "Yahoo",
    host: "imap.mail.yahoo.com",
    port: 993,
    domains: ["yahoo.com", "ymail.com"],
    note: "Yahoo requires an App Password — generate one in Account Security.",
  },
  custom: { label: "Other / custom", host: "", port: 993, domains: [], note: "Ask your provider for their IMAP host — not their SMTP host." },
} as const;

export type ProviderKey = keyof typeof IMAP_PROVIDERS;

// Best-guess provider from the address the user typed, so the right IMAP host
// and port get filled in before they can reach for SMTP settings.
export function providerForEmail(email: string): ProviderKey | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  for (const [key, p] of Object.entries(IMAP_PROVIDERS)) {
    if ((p.domains as readonly string[]).includes(domain)) return key as ProviderKey;
  }
  return null;
}

export const CATEGORIES: Category[] = ["Hiring", "Client Support", "Sales", "Finance", "Internal", "Marketing", "Technical", "General"];
export const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];
export const STATUSES: EmailStatus[] = ["New", "Open", "Closed"];
export const STAGES: Stage[] = ["New", "Shortlisted", "Interviewing", "Offer", "Rejected", "Hired"];

// ─── Server-side list filtering/sorting/pagination ─────────────────────────

// Every value here must be a real scalar column on EmailSummary — lib/cache.ts
// feeds it straight to Prisma as `orderBy: { [sortBy]: sortOrder }`.
// The candidate* fields back the Candidate Sheet's sortable columns, which
// previously fell through the whitelist and silently didn't sort at all.
export type SortField =
  | "date" | "priorityRank" | "status" | "category" | "from" | "subject" | "stage"
  | "candidateName" | "candidateRole" | "candidateExperience";
export type SortOrder = "asc" | "desc";

export interface EmailListQuery {
  page: number;
  pageSize: number;
  search?: string;
  keywords?: string;
  category?: Category[];
  priority?: Priority[];
  status?: EmailStatus[];
  actionRequired?: ActionRequired[];
  stage?: Stage[];
  tags?: string[];
  skills?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: SortField;
  sortOrder?: SortOrder;
}

export interface EmailListResult {
  summaries: EmailSummary[];
  total: number;
  page: number;
  pageSize: number;
}
