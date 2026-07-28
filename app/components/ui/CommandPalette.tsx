"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { EmailSummary } from "@/lib/types";
import { parseSender, formatRelative } from "@/lib/utils";
import { useDashboard } from "../DashboardProvider";
import { useUIPrefs } from "../UIPrefsProvider";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  shortcut?: string;
  run: () => void;
  icon: JSX.Element;
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
    </svg>
  );
}

const PATH = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  inbox: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  brief: "M20 7h-3V6a2 2 0 00-2-2H9a2 2 0 00-2 2v1H4a1 1 0 00-1 1v10a2 2 0 002 2h14a2 2 0 002-2V8a1 1 0 00-1-1zM9 6h6v1H9V6z",
  sheet: "M9 17V7a2 2 0 012-2h6a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2zM9 17H7a2 2 0 01-2-2V9m4 2h6m-6 4h6",
  sync: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  download: "M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H6a2 2 0 00-2 2z",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  density: "M4 6h16M4 12h16M4 18h16",
  expand: "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4",
  keyboard: "M8 9h.01M12 9h.01M16 9h.01M8 13h.01M16 13h.01M10 17h4M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
  onLogout: () => void;
}

export default function CommandPalette({ open, onClose, onShowShortcuts, onLogout }: CommandPaletteProps) {
  const router = useRouter();
  const { syncEmails, fetchAllEmails, clearAndResync } = useDashboard();
  const { density, toggleDensity, focusMode, toggleFocusMode } = useUIPrefs();

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<EmailSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset every time the palette opens so it never reopens mid-typing on a
  // stale query with a stale highlighted row.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    setResults([]);
    inputRef.current?.focus();
  }, [open]);

  const go = useCallback((href: string) => { onClose(); router.push(href); }, [onClose, router]);
  const act = useCallback((fn: () => void) => { onClose(); fn(); }, [onClose]);

  const commands = useMemo<Command[]>(() => [
    { id: "nav-home", group: "Go to", label: "Dashboard", hint: "Overview of your inbox", shortcut: "G then D", run: () => go("/"), icon: <Icon d={PATH.home} /> },
    { id: "nav-inbox", group: "Go to", label: "Inbox", hint: "All emails with AI summaries", shortcut: "G then I", run: () => go("/inbox"), icon: <Icon d={PATH.inbox} /> },
    { id: "nav-hiring", group: "Go to", label: "Hiring", hint: "Candidates and applications", shortcut: "G then H", run: () => go("/hiring"), icon: <Icon d={PATH.user} /> },
    { id: "nav-jobs", group: "Go to", label: "Jobs", hint: "Job postings and matching", shortcut: "G then J", run: () => go("/jobs"), icon: <Icon d={PATH.brief} /> },
    { id: "nav-sheet", group: "Go to", label: "Candidate Sheet", hint: "Spreadsheet of every candidate", shortcut: "G then C", run: () => go("/candidates"), icon: <Icon d={PATH.sheet} /> },

    { id: "act-sync", group: "Actions", label: "Sync inbox", hint: "Check for new mail since the last sync", keywords: "fetch refresh new mail", run: () => act(syncEmails), icon: <Icon d={PATH.sync} /> },
    { id: "act-import", group: "Actions", label: "Import entire mailbox", hint: "Page through every message, not just the newest", keywords: "backfill all history", run: () => act(fetchAllEmails), icon: <Icon d={PATH.download} /> },
    { id: "act-rebuild", group: "Actions", label: "Rebuild all summaries", hint: "Clear stored summaries and regenerate from scratch", keywords: "reset resync clear", run: () => act(clearAndResync), icon: <Icon d={PATH.trash} /> },

    { id: "view-density", group: "View", label: density === "compact" ? "Switch to comfortable rows" : "Switch to compact rows", hint: "Fit more on screen, or give rows more room", keywords: "density spacing compact comfortable rows", shortcut: "D", run: () => act(toggleDensity), icon: <Icon d={PATH.density} /> },
    { id: "view-focus", group: "View", label: focusMode ? "Show the navigation bar" : "Hide the navigation bar", hint: "Focus mode gives the top bar's height back to your content", keywords: "focus zen fullscreen chrome hide", shortcut: "F", run: () => act(toggleFocusMode), icon: <Icon d={PATH.expand} /> },
    { id: "view-keys", group: "View", label: "Keyboard shortcuts", hint: "See everything you can do without the mouse", keywords: "help keys hotkeys", shortcut: "?", run: () => act(onShowShortcuts), icon: <Icon d={PATH.keyboard} /> },

    { id: "acct-logout", group: "Account", label: "Sign out", keywords: "logout exit", run: () => act(onLogout), icon: <Icon d={PATH.logout} /> },
  ], [go, act, syncEmails, fetchAllEmails, clearAndResync, density, toggleDensity, focusMode, toggleFocusMode, onShowShortcuts, onLogout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Live email search runs alongside the command filter, so ⌘K doubles as
  // "jump to an email" without first navigating to the Inbox and searching there.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) { setResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/email/process?page=1&pageSize=6&search=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) setResults(data.summaries ?? []);
      } catch { /* aborted or offline — just show commands */ }
      finally { setIsSearching(false); }
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, open]);

  // One flat list of everything selectable, so ↑/↓ walks commands and email
  // results as a single sequence instead of two separate cursors.
  const items = useMemo(() => [
    ...filtered.map((c) => ({ kind: "command" as const, command: c })),
    ...results.map((e) => ({ kind: "email" as const, email: e })),
  ], [filtered, results]);

  useEffect(() => { setCursor(0); }, [query]);
  useEffect(() => {
    if (cursor >= items.length) setCursor(Math.max(0, items.length - 1));
  }, [items.length, cursor]);

  // Keep the highlighted row inside the scroll viewport as the cursor moves.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const runItem = useCallback((i: number) => {
    const item = items[i];
    if (!item) return;
    if (item.kind === "command") item.command.run();
    else go(`/inbox/${encodeURIComponent(item.email.emailId)}`);
  }, [items, go]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); runItem(cursor); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-[2px] animate-overlay-in" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-gray-900/10 overflow-hidden animate-modal-in"
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-gray-100">
          {isSearching ? (
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          ) : (
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emails, jump to a page, or run a command…"
            className="flex-1 py-3.5 text-sm bg-transparent focus:outline-none placeholder:text-gray-400"
          />
          <kbd className="flex-shrink-0 text-[10px] font-sans font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No matches for “{query}”</p>
          ) : (
            items.map((item, i) => {
              const active = i === cursor;
              const group = item.kind === "command" ? item.command.group : "Emails";
              const showHeader = group !== lastGroup;
              lastGroup = group;

              return (
                <div key={item.kind === "command" ? item.command.id : item.email.emailId}>
                  {showHeader && (
                    <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{group}</p>
                  )}
                  <button
                    type="button"
                    data-active={active}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => runItem(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                      active ? "bg-indigo-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className={`flex-shrink-0 ${active ? "text-indigo-600" : "text-gray-400"}`}>
                      {item.kind === "command" ? item.command.icon : <Icon d={PATH.inbox} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${active ? "text-indigo-900 font-medium" : "text-gray-700"}`}>
                        {item.kind === "command" ? item.command.label : (item.email.subject || "(No Subject)")}
                      </span>
                      {(item.kind === "command" ? item.command.hint : item.email.from) && (
                        <span className="block text-xs text-gray-400 truncate">
                          {item.kind === "command" ? item.command.hint : parseSender(item.email.from).name}
                        </span>
                      )}
                    </span>
                    {item.kind === "command" && item.command.shortcut && (
                      <kbd className="flex-shrink-0 text-[10px] font-sans font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                        {item.command.shortcut}
                      </kbd>
                    )}
                    {item.kind === "email" && (
                      <span className="flex-shrink-0 text-[10px] text-gray-400">{formatRelative(item.email.date)}</span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50/60 text-[10px] text-gray-400">
          <span><kbd className="font-sans font-semibold text-gray-500">↑↓</kbd> navigate</span>
          <span><kbd className="font-sans font-semibold text-gray-500">↵</kbd> select</span>
          <span className="ml-auto"><kbd className="font-sans font-semibold text-gray-500">?</kbd> all shortcuts</span>
        </div>
      </div>
    </div>
  );
}
