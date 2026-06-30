"use client";

import type { NavView } from "@/lib/types";

interface SidebarProps {
  active: NavView;
  onChange: (v: NavView) => void;
  emailCount: number;
  unreadCount: number;
  hiringCount: number;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV: { id: NavView; label: string; badge?: "unread" | "hiring"; icon: JSX.Element }[] = [
  {
    id: "home", label: "Dashboard",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    id: "inbox", label: "Inbox", badge: "unread",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>,
  },
  {
    id: "hiring", label: "Hiring", badge: "hiring",
    icon: <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  },
];

export default function Sidebar({ active, onChange, emailCount, unreadCount, hiringCount, collapsed, onToggle }: SidebarProps) {
  return (
    <aside className={`${collapsed ? "w-[60px]" : "w-56"} flex-shrink-0 bg-[#0f172a] flex flex-col transition-all duration-200 ease-in-out overflow-hidden border-r border-white/[0.04]`}>

      {/* Brand */}
      <div className={`h-14 flex items-center flex-shrink-0 ${collapsed ? "justify-center px-3" : "px-4 gap-2.5"}`}>
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">MailAI</p>
            <p className="text-indigo-400 text-[10px] tracking-wider">Smart Inbox</p>
          </div>
        )}
      </div>

      <div className="mx-3 mb-1 h-px bg-white/[0.06]" />

      {/* Nav */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const isActive = active === item.id;
          const badge = item.badge === "unread" ? unreadCount : item.badge === "hiring" ? hiringCount : 0;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
                ${collapsed ? "justify-center p-2.5" : "px-3 py-2"}
                ${isActive
                  ? "bg-indigo-500/10 text-indigo-300"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"
                }`}
            >
              <span className={`flex-shrink-0 ${isActive ? "text-indigo-400" : ""}`}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {badge > 0 && (
                    <span className={`text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full
                      ${isActive ? "bg-indigo-500/25 text-indigo-300" : "bg-slate-700 text-slate-400"}`}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 space-y-1 flex-shrink-0 border-t border-white/[0.04]">
        <div className={`flex items-center gap-2.5 rounded-lg p-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold flex-shrink-0">
            A
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-slate-300 text-xs font-medium truncate">access@asadullah.io</p>
              <p className="text-slate-600 text-[10px]">{emailCount} emails synced</p>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`w-full flex items-center gap-2 rounded-lg p-2 text-slate-600 hover:text-slate-400 hover:bg-white/[0.04] transition-colors ${collapsed ? "justify-center" : ""}`}
        >
          <svg className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
