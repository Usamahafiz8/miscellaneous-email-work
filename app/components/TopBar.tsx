"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useUIPrefs } from "./UIPrefsProvider";

interface TopBarProps {
  emailCount: number;
  unreadCount: number;
  hiringCount: number;
  accountEmail: string;
  onLogout: () => void;
  onOpenPalette: () => void;
  onShowShortcuts: () => void;
}

const NAV: { href: string; label: string; short: string; hint: string; badge?: "unread" | "hiring"; icon: JSX.Element }[] = [
  {
    href: "/", label: "Dashboard", short: "Home", hint: "Overview of everything happening in your inbox (G then D)",
    icon: <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    href: "/inbox", label: "Inbox", short: "Inbox", hint: "All of your emails with AI-generated summaries (G then I)", badge: "unread",
    icon: <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>,
  },
  {
    href: "/hiring", label: "Hiring", short: "Hiring", hint: "Job applications and candidates, in one place (G then H)", badge: "hiring",
    icon: <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  },
  {
    href: "/jobs", label: "Jobs", short: "Jobs", hint: "Manage job postings and match them to candidates (G then J)",
    icon: <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7h-3V6a2 2 0 00-2-2H9a2 2 0 00-2 2v1H4a1 1 0 00-1 1v10a2 2 0 002 2h14a2 2 0 002-2V8a1 1 0 00-1-1zM9 6h6v1H9V6z" /></svg>,
  },
  {
    href: "/candidates", label: "Candidate Sheet", short: "Sheet", hint: "A spreadsheet-style view of every candidate's details (G then C)",
    icon: <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17V7a2 2 0 012-2h6a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2zM9 17H7a2 2 0 01-2-2V9m4 2h6m-6 4h6" /></svg>,
  },
];

function IconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
        active ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

export default function TopBar({
  emailCount, unreadCount, hiringCount, accountEmail, onLogout, onOpenPalette, onShowShortcuts,
}: TopBarProps) {
  const pathname = usePathname();
  const { density, toggleDensity, toggleFocusMode } = useUIPrefs();
  const initial = (accountEmail.trim()[0] || "?").toUpperCase();

  // The account email, sync count, shortcuts link and sign-out all used to sit
  // inline in the bar. Folding them into one avatar menu frees ~220px of
  // horizontal space for the nav, which is what people actually click.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="h-12 flex-shrink-0 bg-[#0f172a] flex items-center px-2.5 gap-2 border-b border-white/[0.06]">
      {/* Brand — mark only below xl, where every pixel of nav width matters. */}
      <Link href="/" title="MailAI — Smart Inbox" className="flex items-center gap-2 flex-shrink-0 pl-1 pr-0.5">
        <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-white text-sm font-semibold leading-none hidden xl:block">MailAI</span>
      </Link>

      <div className="w-px h-5 bg-white/[0.08] flex-shrink-0" />

      {/* Nav — scrolls horizontally rather than wrapping, with the scrollbar
          hidden so it doesn't eat a row of the 48px bar. */}
      <nav className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        {NAV.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = item.badge === "unread" ? unreadCount : item.badge === "hiring" ? hiringCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.hint}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-lg text-[13px] font-medium px-2.5 h-8 whitespace-nowrap transition-colors
                ${isActive ? "bg-indigo-500/12 text-indigo-300 ring-1 ring-inset ring-indigo-500/25" : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]"}`}
            >
              <span className={isActive ? "text-indigo-400" : ""}>{item.icon}</span>
              {/* Full label on wide screens, an abbreviation from md up, icon
                  only on the narrowest — the nav never scrolls unnecessarily. */}
              <span className="hidden lg:inline">{item.label}</span>
              <span className="hidden md:inline lg:hidden">{item.short}</span>
              {badge > 0 && (
                <span className={`text-[10px] font-bold min-w-[17px] text-center px-1 py-px rounded-full
                  ${isActive ? "bg-indigo-500/25 text-indigo-200" : "bg-slate-700/80 text-slate-300"}`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Command palette trigger — styled as a search field so it reads as
          "search everything" rather than a mystery button. */}
      <button
        type="button"
        onClick={onOpenPalette}
        title="Search emails, jump to a page, or run a command (⌘K)"
        className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
        </svg>
        <span className="hidden lg:inline text-[13px]">Search…</span>
        <kbd className="hidden lg:inline text-[10px] font-sans font-semibold bg-white/[0.08] rounded px-1 py-px">⌘K</kbd>
      </button>

      <IconButton
        label={density === "compact" ? "Comfortable rows (D)" : "Compact rows — fit more on screen (D)"}
        onClick={toggleDensity}
        active={density === "compact"}
      >
        {density === "compact" ? (
          <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        ) : (
          <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5h16M4 9h16M4 15h16M4 19h16" />
          </svg>
        )}
      </IconButton>

      <IconButton label="Focus mode — hide this bar and use the full height (F)" onClick={toggleFocusMode}>
        <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </IconButton>

      {/* Account menu */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          title={`${accountEmail} · ${emailCount} emails synced`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-colors"
        >
          {initial}
        </button>

        {menuOpen && (
          <div role="menu" className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl border border-gray-200 shadow-xl z-50 py-1 animate-dropdown-in">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-800 truncate">{accountEmail}</p>
              <p className="text-[11px] text-gray-400">{emailCount.toLocaleString()} emails synced</p>
            </div>
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onShowShortcuts(); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Keyboard shortcuts
              <kbd className="text-[10px] font-sans font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">?</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); toggleFocusMode(); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Focus mode
              <kbd className="text-[10px] font-sans font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">F</kbd>
            </button>
            <div className="my-1 h-px bg-gray-100" />
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
