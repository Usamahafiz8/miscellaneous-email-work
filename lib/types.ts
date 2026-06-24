export interface IMAPConfig {
  email: string;
  password: string;
  host: string;
  port: number;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  text: string;
  fullText: string;
}

export type SummaryLength = "short" | "medium" | "long";
export type Sentiment = "positive" | "neutral" | "negative";
export type Category = "Hiring" | "Client Support" | "Sales" | "Finance" | "Internal" | "Marketing" | "Technical" | "General";
export type Priority = "Critical" | "High" | "Medium" | "Low";
export type ActionRequired = "Yes" | "No";
export type EmailStatus = "New" | "Open" | "Closed";
export type NavView = "home" | "inbox" | "hiring" | "analytics";

export interface EmailSummary {
  emailId: string;
  from: string;
  subject: string;
  date: string;
  summary: string;
  keyPoints: string[];
  sentiment: Sentiment;
  category: Category;
  priority: Priority;
  actionRequired: ActionRequired;
  purpose: string;
  status: EmailStatus;
  fetchedAt?: string;
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

export const IMAP_PROVIDERS = {
  gmail: { host: "imap.gmail.com", port: 993, note: "Use App Password from myaccount.google.com/apppasswords" },
  outlook: { host: "imap-mail.outlook.com", port: 993, note: "Enable IMAP in Outlook settings first" },
  custom: { host: "", port: 993, note: "Ask your email provider for IMAP settings" },
} as const;

export type ProviderKey = keyof typeof IMAP_PROVIDERS;

export const CATEGORIES: Category[] = ["Hiring", "Client Support", "Sales", "Finance", "Internal", "Marketing", "Technical", "General"];
export const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];
export const STATUSES: EmailStatus[] = ["New", "Open", "Closed"];
