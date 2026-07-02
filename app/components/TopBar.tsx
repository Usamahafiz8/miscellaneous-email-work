"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TopBarProps {
  emailCount: number;
  unreadCount: number;
  hiringCount: number;
}

const NAV: { href: string; label: string; badge?: "unread" | "hiring"; icon: JSX.Element }[] = [
  {
    href: "/", label: "Dashboard",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    href: "/inbox", label: "Inbox", badge: "unread",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>,
  },
  {
    href: "/hiring", label: "Hiring", badge: "hiring",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  },
  {
    href: "/jobs", label: "Jobs",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7h-3V6a2 2 0 00-2-2H9a2 2 0 00-2 2v1H4a1 1 0 00-1 1v10a2 2 0 002 2h14a2 2 0 002-2V8a1 1 0 00-1-1zM9 6h6v1H9V6z" /></svg>,
  },
  {
    href: "/candidates", label: "Candidate Sheet",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17V7a2 2 0 012-2h6a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2zM9 17H7a2 2 0 01-2-2V9m4 2h6m-6 4h6" /></svg>,
  },
];

export default function TopBar({ emailCount, unreadCount, hiringCount }: TopBarProps) {
  const pathname = usePathname();

  return (
    <header className="h-14 flex-shrink-0 bg-[#0f172a] flex items-center px-4 gap-4 border-b border-white/[0.06]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-white text-sm font-semibold leading-tight hidden sm:block">MailAI</p>
      </div>

      <div className="w-px h-6 bg-white/[0.08] flex-shrink-0" />

      {/* Nav */}
      <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        {NAV.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = item.badge === "unread" ? unreadCount : item.badge === "hiring" ? hiringCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg text-sm font-medium px-3 py-2 whitespace-nowrap transition-colors
                ${isActive ? "bg-indigo-500/10 text-indigo-300" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"}`}
            >
              <span className={isActive ? "text-indigo-400" : ""}>{item.icon}</span>
              <span>{item.label}</span>
              {badge > 0 && (
                <span className={`text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full
                  ${isActive ? "bg-indigo-500/25 text-indigo-300" : "bg-slate-700 text-slate-400"}`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold flex-shrink-0">
          A
        </div>
        <div className="hidden md:block min-w-0">
          <p className="text-slate-300 text-xs font-medium truncate">access@asadullah.io</p>
          <p className="text-slate-600 text-[10px]">{emailCount} emails synced</p>
        </div>
      </div>
    </header>
  );
}
