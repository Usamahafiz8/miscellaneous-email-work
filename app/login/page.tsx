"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IMAP_PROVIDERS, providerForEmail, type ProviderKey } from "@/lib/types";

const DEFAULT_HOST = IMAP_PROVIDERS.purelymail.host;
const DEFAULT_PORT = IMAP_PROVIDERS.purelymail.port;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Explicit generics: IMAP_PROVIDERS is `as const`, so the defaults are literal
  // types and inference would pin these to just the PurelyMail values.
  const [host, setHost] = useState<string>(DEFAULT_HOST);
  const [port, setPort] = useState<number>(DEFAULT_PORT);
  // Which provider's IMAP settings are in use. Auto-follows the address the user
  // types until they pick one themselves — the point is that nobody should ever
  // have to know their IMAP host, which is how SMTP settings end up in there.
  const [provider, setProvider] = useState<ProviderKey>("purelymail");
  const [providerPinned, setProviderPinned] = useState(false);

  function applyProvider(key: ProviderKey) {
    setProvider(key);
    const preset = IMAP_PROVIDERS[key];
    if (preset.host) setHost(preset.host);
    setPort(preset.port);
  }

  // Detect from the domain as they type, but never override a provider they
  // chose deliberately.
  //
  // Two passes. The literal provider domains (foo@gmail.com) resolve instantly
  // with no network call. Anything else is a custom domain — which is the normal
  // case for a work address, and says nothing about its host by name — so it's
  // resolved by MX lookup on the server: a Google Workspace domain points at
  // google.com, a PurelyMail one at purelymail.com.
  useEffect(() => {
    if (providerPinned) return;
    const detected = providerForEmail(email);
    if (!detected || detected === provider) return;
    setProvider(detected);
    const preset = IMAP_PROVIDERS[detected];
    if (preset.host) setHost(preset.host);
    setPort(preset.port);
  }, [email, provider, providerPinned]);

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (providerPinned) return;
    const domain = email.split("@")[1]?.trim();
    // Needs a plausible domain before it's worth asking DNS about.
    if (!domain || !domain.includes(".") || domain.endsWith(".")) {
      setDetectedLabel(null);
      return;
    }
    if (providerForEmail(email)) return; // already handled above, no lookup needed

    let active = true;
    setIsDetecting(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/detect-provider?email=${encodeURIComponent(email.trim())}`);
        const data = await res.json().catch(() => null);
        // `active` guards a stale response landing after the address changed again.
        if (!active || !data?.provider) { setDetectedLabel(null); return; }
        setProvider(data.provider);
        if (data.host) setHost(data.host);
        if (data.port) setPort(data.port);
        setDetectedLabel(data.label ?? null);
      } catch {
        /* offline or DNS unavailable — the picker still works by hand */
      } finally {
        if (active) setIsDetecting(false);
      }
    }, 500);

    return () => { active = false; clearTimeout(t); setIsDetecting(false); };
  }, [email, providerPinned]);

  const providerNote = IMAP_PROVIDERS[provider].note;

  // The provider dropdown and the Advanced port can disagree: pick Gmail, then
  // hand-edit the port, and the form still says "Gmail" while pointing somewhere
  // Gmail doesn't serve. That contradiction should be visible before submitting
  // rather than surfacing as a connection timeout ten seconds later.
  const expectedPort = IMAP_PROVIDERS[provider].port;
  const portMismatch = port !== expectedPort;

  // Google and Yahoo app passwords are 16 characters, displayed in four groups of
  // four. Anything else against those providers is almost certainly the account's
  // real password, which they reject unconditionally — worth saying before a
  // round trip, since "wrong password" reads like a typo rather than "this kind of
  // password can never work here". A hint, not a block: only the server decides.
  const needsAppPassword = provider === "gmail" || provider === "yahoo";
  const looksLikeAccountPassword =
    needsAppPassword && password.length > 0 && password.replace(/\s/g, "").length !== 16;
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // If already signed in, skip the form.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json().catch(() => null);
        if (active && data?.authenticated) {
          router.replace("/");
          return;
        }
      } catch {
        /* fall through to the form */
      }
      if (active) setCheckingSession(false);
    })();
    return () => { active = false; };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      // Google and Yahoo show app passwords as four space-separated groups
      // ("abcd efgh ijkl mnop") purely for readability — the real secret is the
      // 16 characters, and pasting the displayed form gets rejected. Strip the
      // spaces only when the result is exactly a 16-character app password for a
      // provider that issues them, so a genuine password containing spaces on
      // any other provider is still sent untouched.
      const compact = password.replace(/\s/g, "");
      const submittedPassword =
        needsAppPassword && compact.length === 16 && compact !== password ? compact : password;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: submittedPassword, host: host.trim(), port }),
      });
      const data = await res.json().catch(() => ({ success: false, error: `Server error ${res.status}` }));
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Sign-in failed");
      }
      // Full navigation so the (dash) server layout re-reads the fresh cookie.
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setIsSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center shadow-lg mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-white text-xl font-semibold">Sign in to MailAI</h1>
          <p className="text-slate-400 text-sm mt-1 text-center max-w-xs">
            MailAI reads your inbox and summarizes what matters, so you don&rsquo;t have to open every email.
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Sign in with any IMAP mailbox — PurelyMail, Gmail, Outlook or Yahoo
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-5"
        >
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourdomain.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your email account password"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Provider picker — fills in the correct IMAP host/port, so the
              Advanced fields below are a genuine override rather than the only
              way to reach a non-PurelyMail mailbox. */}
          <div>
            <label htmlFor="provider" className="block text-xs font-medium text-gray-500 mb-1">
              Email provider
              {isDetecting && <span className="ml-2 font-normal text-gray-400">checking your domain…</span>}
              {!isDetecting && detectedLabel && (
                <span className="ml-2 font-normal text-emerald-600">detected: {detectedLabel}</span>
              )}
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => { setProviderPinned(true); applyProvider(e.target.value as ProviderKey); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
            >
              {Object.entries(IMAP_PROVIDERS).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
            {providerNote && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded-lg px-3 py-2">
                {providerNote}
              </p>
            )}
            {looksLikeAccountPassword && (
              <p className="mt-2 text-xs text-red-700 bg-red-50 ring-1 ring-inset ring-red-200 rounded-lg px-3 py-2">
                That password is {password.replace(/\s/g, "").length} characters.
                {" "}{IMAP_PROVIDERS[provider].label} app passwords are exactly <strong>16</strong> —
                so this looks like your normal account password, which {IMAP_PROVIDERS[provider].label} always
                refuses over IMAP. Generate an app password and paste that instead.
              </p>
            )}
            {portMismatch && (
              <div className="mt-2 flex items-start gap-2 text-xs text-red-700 bg-red-50 ring-1 ring-inset ring-red-200 rounded-lg px-3 py-2">
                <span className="flex-1">
                  Port is set to <strong>{port}</strong>, but {IMAP_PROVIDERS[provider].label} uses <strong>{expectedPort}</strong>.
                  This will time out.
                </span>
                <button
                  type="button"
                  onClick={() => setPort(expectedPort)}
                  className="flex-shrink-0 font-semibold underline hover:no-underline"
                >
                  Use {expectedPort}
                </button>
              </div>
            )}
          </div>

          {/* Advanced: IMAP server override */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-xs font-medium text-[#667eea] hover:text-[#5563d6] flex items-center gap-1"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced (IMAP server)
            </button>
            {showAdvanced && (
              <p className="mt-2 text-[11px] text-gray-500">
                These are <strong>IMAP</strong> (incoming) settings — this app reads your mail and never sends any.
                SMTP ports (587, 465, 25) will fail the secure handshake. IMAP is port 993.
              </p>
            )}
            {showAdvanced && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">IMAP Host</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={DEFAULT_HOST}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    min={1}
                    max={65535}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-[0.98] shadow-sm"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Your email and password are only used to connect to your own mailbox, and are
            kept encrypted in your session — never shared with anyone else.
          </p>
        </form>
      </div>
    </div>
  );
}
