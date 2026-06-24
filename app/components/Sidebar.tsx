"use client";

import type { NavView } from "@/lib/types";

interface SidebarProps {
  active: NavView;
  onChange: (v: NavView) => void;
  emailCount: number;
  hiringCount: number;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV: { id: NavView; label: string; icon: React.ReactNode; badge?: "email" | "hiring" }[] = [
  {
    id: "home", label: "Overview",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  },
  {
    id: "inbox", label: "Inbox", badge: "email",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  },
  {
    id: "hiring", label: "Hiring", badge: "hiring",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    id: "analytics", label: "Analytics",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
];

export default function Sidebar({ active, onChange, emailCount, hiringCount, collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`${collapsed ? "w-16" : "w-60"} flex-shrink-0 bg-[#0f172a] flex flex-col transition-all duration-300 ease-in-out overflow-hidden`}
    >
      {/* Brand */}
      <div className={`h-16 flex items-center flex-shrink-0 border-b border-white/5 ${collapsed ? "justify-center px-3" : "px-5 gap-3"}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#667eea]/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white text-sm font-bold leading-tight">Asad ullah</p>
            <p className="text-[#667eea] text-[10px] font-medium tracking-wide uppercase">Email Portal</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {!collapsed && (
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">Main Menu</p>
        )}
        {NAV.map((item) => {
          const isActive = active === item.id;
          const badge = item.badge === "email" ? emailCount : item.badge === "hiring" ? hiringCount : 0;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group
                ${collapsed ? "justify-center p-3" : "px-3 py-2.5"}
                ${isActive
                  ? "bg-[#667eea]/15 text-[#667eea]"
                  : "text-gray-400 hover:text-gray-100 hover:bg-white/5"
                }`}
            >
              <span className={`flex-shrink-0 transition-colors ${isActive ? "text-[#667eea]" : "text-gray-500 group-hover:text-gray-300"}`}>
                {item.icon}
              </span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                  {badge > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.badge === "hiring" ? "bg-violet-500/20 text-violet-400" : "bg-[#667eea]/20 text-[#667eea]"}`}>
                      {badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 h-px bg-white/5" />

      {/* Account + Toggle */}
      <div className="p-3 space-y-1">
        {/* Account */}
        <div className={`flex items-center gap-2.5 rounded-lg p-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            A
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-gray-300 text-xs font-medium truncate">access@asadullah.io</p>
              <p className="text-gray-600 text-[10px]">Administrator</p>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className={`w-full flex items-center gap-2 rounded-lg p-2 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors ${collapsed ? "justify-center" : ""}`}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
