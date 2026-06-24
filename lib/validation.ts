import type { IMAPConfig, ProcessEmailsRequest, SummarizeRequest, ValidationResult } from "./types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  if (!email) return "Email cannot be empty";
  if (!EMAIL_REGEX.test(email)) return "Please enter a valid email address";
  return null;
}

export function validateIMAPConfig(config: IMAPConfig): ValidationResult {
  const errors: Partial<Record<string, string>> = {};

  const emailError = validateEmail(config.email);
  if (emailError) errors.email = emailError;

  if (!config.password) errors.password = "Password cannot be empty";

  if (!config.host) errors.host = "IMAP host cannot be empty";

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.port = "Port must be between 1 and 65535";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateProcessRequest(req: ProcessEmailsRequest): ValidationResult {
  const errors: Partial<Record<string, string>> = {};

  const configValidation = validateIMAPConfig({
    email: req.email,
    password: req.password,
    host: req.host,
    port: req.port,
  });

  Object.assign(errors, configValidation.errors);

  if (!req.maxEmails || req.maxEmails < 1 || req.maxEmails > 100) {
    errors.maxEmails = "Max emails must be between 1 and 100";
  }

  if (!["short", "medium", "long"].includes(req.summaryLength)) {
    errors.summaryLength = "Summary length must be short, medium, or long";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateSummarizeRequest(req: SummarizeRequest): ValidationResult {
  const errors: Partial<Record<string, string>> = {};

  if (!req.emails || !Array.isArray(req.emails) || req.emails.length === 0) {
    errors.emails = "At least one email is required";
  }

  if (!["short", "medium", "long"].includes(req.summaryLength)) {
    errors.summaryLength = "Summary length must be short, medium, or long";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function sanitizeHtml(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
