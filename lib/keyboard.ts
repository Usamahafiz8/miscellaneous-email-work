// Single-key shortcuts (j/k/f/d/g/?) must never fire while the user is typing
// — otherwise searching for "definitely" would toggle density, jump views, and
// scroll the list. Every keydown handler in the app gates on this first.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable === true
  );
}

// True for ⌘K on macOS and Ctrl+K everywhere else, so the palette opens with
// whichever modifier the platform's users actually expect.
export function isCommandKey(e: KeyboardEvent, key: string): boolean {
  return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key;
}

// ── "g then <key>" navigation prefix ────────────────────────────────────────
// Two separate window listeners care about this: AppChrome (which performs the
// jump) and the list views (whose j/k row navigation must NOT also fire when
// `j` was the tail of "g j" → Jobs). Listener order between them isn't
// something either side should have to depend on, so the state lives here and
// `isGSequenceKey` answers true both while the prefix is pending *and* for a
// beat after it's been consumed — correct whichever listener runs first.
const G_WINDOW_MS = 1200;
const G_TAIL_MS = 60;

let gPressedAt = 0;
let gConsumedAt = 0;

export function markGPrefix(): void {
  gPressedAt = Date.now();
}

export function isGPrefixPending(): boolean {
  return Date.now() - gPressedAt < G_WINDOW_MS;
}

export function consumeGPrefix(): void {
  gPressedAt = 0;
  gConsumedAt = Date.now();
}

export function isGSequenceKey(): boolean {
  return isGPrefixPending() || Date.now() - gConsumedAt < G_TAIL_MS;
}
