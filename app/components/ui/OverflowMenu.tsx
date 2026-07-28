"use client";

import { useState, useRef, useEffect } from "react";

export interface OverflowItem {
  label: string;
  description?: string;
  onSelect: () => void;
  icon?: JSX.Element;
  disabled?: boolean;
  danger?: boolean;
  busy?: boolean;
}

// Secondary page actions ("Summarize Attachments", "Import Entire Mailbox",
// "Rebuild All Summaries") used to sit in the toolbar as four full-width
// buttons. They're rare, destructive-ish, or slow — folding them behind one
// 32px trigger keeps the primary action obvious and frees the row for filters.
export default function OverflowMenu({ items, label = "More actions" }: { items: OverflowItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const anyBusy = items.some((i) => i.busy);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
          open ? "border-gray-300 bg-gray-100 text-gray-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        }`}
      >
        {anyBusy ? (
          <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="4" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="10" cy="16" r="1.6" />
          </svg>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-64 bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-1 animate-dropdown-in">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled || item.busy}
              onClick={() => { setOpen(false); item.onSelect(); }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger ? "hover:bg-red-50 text-red-600" : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              <span className={`flex-shrink-0 mt-0.5 ${item.danger ? "text-red-500" : "text-gray-400"}`}>
                {item.busy
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium">{item.busy ? `${item.label}…` : item.label}</span>
                {item.description && <span className="block text-[11px] text-gray-400 leading-snug mt-0.5">{item.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
