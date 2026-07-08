import { cookies } from "next/headers";
import crypto from "crypto";
import type { IMAPConfig } from "./types";

// ─── Encrypted-cookie session ───────────────────────────────────────────────
// PurelyMail has no OAuth, so "logging in" means proving you own a mailbox by
// authenticating against its IMAP server (see /api/auth/login). We then need
// that same password on every subsequent sync, so we stash the credentials in
// an AES-256-GCM-encrypted, httpOnly cookie — never persisted to the database.
// The account's email (lowercased) doubles as the tenant key every DB row is
// scoped by, so one user never sees another's summaries/jobs/candidates.

const COOKIE = "mailai_session";
const ALGO = "aes-256-gcm";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  email: string;
  password: string;
  host: string;
  port: number;
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set — cannot manage sessions");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSession(s: Session): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(s), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: [iv(12)][authTag(16)][ciphertext]
  return Buffer.concat([iv, tag, data]).toString("base64url");
}

export function decryptSession(token: string): Session | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(out) as Partial<Session>;
    if (typeof parsed.email === "string" && typeof parsed.password === "string") {
      return {
        email: parsed.email,
        password: parsed.password,
        host: typeof parsed.host === "string" ? parsed.host : "imap.purelymail.com",
        port: typeof parsed.port === "number" ? parsed.port : 993,
      };
    }
    return null;
  } catch {
    // Tampered/garbage cookie, or a key rotation — treat as logged out.
    return null;
  }
}

// Set/clear are only valid inside Route Handlers or Server Actions.
export function setSessionCookie(s: Session): void {
  cookies().set(COOKIE, encryptSession(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(): void {
  cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// Readable from any server context (route handler, server component, layout).
export function getSession(): Session | null {
  const raw = cookies().get(COOKIE)?.value;
  return raw ? decryptSession(raw) : null;
}

// The tenant key: lowercased email of the signed-in account, or null if logged out.
export function currentAccount(): string | null {
  const s = getSession();
  return s ? s.email.trim().toLowerCase() : null;
}

// IMAP credentials for the signed-in account, or null if logged out.
export function currentImapConfig(): IMAPConfig | null {
  const s = getSession();
  return s ? { email: s.email, password: s.password, host: s.host, port: s.port } : null;
}

export const SESSION_COOKIE = COOKIE;
