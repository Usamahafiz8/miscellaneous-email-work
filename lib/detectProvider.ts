import { resolveMx } from "dns/promises";
import { providerForEmail, type ProviderKey } from "./types";

// Server-only: figures out which IMAP provider actually hosts a domain.
//
// The static domain list in IMAP_PROVIDERS only recognises the providers' own
// domains (gmail.com, outlook.com …), which misses the common case entirely —
// a company address on a custom domain. Both of this app's real accounts are
// like that: asadullah.io is hosted by PurelyMail, and a Google Workspace
// address is hosted by Google, yet neither domain says so by name. Without this
// they'd fall through to the default host and fail against the wrong server.
//
// A domain's MX records do say so, unambiguously.

// Matched against each MX hostname, in order. First hit wins.
const MX_SIGNATURES: { provider: ProviderKey; test: RegExp }[] = [
  // Workspace publishes aspmx.l.google.com / smtp.google.com; consumer Gmail
  // publishes gmail-smtp-in.l.google.com. Both are Google-hosted IMAP.
  { provider: "gmail", test: /(^|\.)(google|googlemail)\.com\.?$/i },
  // Microsoft 365 publishes <tenant>.mail.protection.outlook.com
  { provider: "outlook", test: /(^|\.)(protection\.outlook\.com|outlook\.com|office365\.com)\.?$/i },
  { provider: "purelymail", test: /(^|\.)purelymail\.com\.?$/i },
  { provider: "yahoo", test: /(^|\.)(yahoodns\.net|yahoo\.com)\.?$/i },
];

export async function detectProviderByMx(email: string): Promise<ProviderKey | null> {
  // Fast path: the provider's own domain needs no DNS at all.
  const staticMatch = providerForEmail(email);
  if (staticMatch) return staticMatch;

  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".")) return null;

  let records: { exchange: string; priority: number }[];
  try {
    records = await resolveMx(domain);
  } catch {
    // No MX, NXDOMAIN, or DNS unavailable — the caller just doesn't get a
    // suggestion, and the user picks a provider themselves.
    return null;
  }

  // Lowest priority number is the primary mail host, and it's the one that
  // decides. Ordering matters for real domains: asadullah.io lists PurelyMail at
  // priority 0 alongside registrar forwarding hosts at 10 and 20, and only the
  // priority-0 record reflects where the mailbox actually lives.
  for (const { exchange } of [...records].sort((a, b) => a.priority - b.priority)) {
    for (const { provider, test } of MX_SIGNATURES) {
      if (test.test(exchange.trim())) return provider;
    }
  }
  return null;
}
