"use client";

import { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
  count?: number;
}

interface MultiSelectFilterProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  accent?: "indigo" | "violet";
}

const ACCENT = {
  indigo: {
    active: "border-indigo-300 bg-indigo-50 text-indigo-700",
    badge: "bg-indigo-600 text-white",
    check: "text-indigo-600 focus:ring-indigo-500",
    link: "text-indigo-600 hover:text-indigo-800",
  },
  violet: {
    active: "border-violet-300 bg-violet-50 text-violet-700",
    badge: "bg-violet-600 text-white",
    check: "text-violet-600 focus:ring-violet-500",
    link: "text-violet-600 hover:text-violet-800",
  },
};

export default function MultiSelectFilter({ label, options, selected, onChange, accent = "indigo" }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const a = ACCENT[accent];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const active = selected.length > 0;
  // Skills/tags lists can run to hundreds of entries — scrolling to find one is
  // painful, so anything long enough to need it gets its own filter box.
  const showSearch = options.length > 8;
  const visible = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={active ? `${label}: ${selected.join(", ")}` : `Filter by ${label.toLowerCase()}`}
        className={`flex items-center gap-1 h-8 text-[13px] rounded-lg border px-2 transition-colors whitespace-nowrap
          ${active ? `${a.active} font-medium` : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
      >
        {label}
        {active && (
          <span className={`text-[10px] font-bold min-w-[15px] text-center px-1 rounded-full ${a.badge}`}>{selected.length}</span>
        )}
        <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-60 bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden animate-dropdown-in">
          {showSearch && (
            <div className="p-1.5 border-b border-gray-100">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${label.toLowerCase()}…`}
                className="w-full h-7 px-2 text-xs rounded-md border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">{options.length === 0 ? "No options" : "No matches"}</p>
            ) : (
              visible.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className={`rounded border-gray-300 ${a.check}`}
                  />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.count !== undefined && <span className="text-[11px] text-gray-400 tabular-nums">{opt.count}</span>}
                </label>
              ))
            )}
          </div>

          {active && (
            <button
              onClick={() => onChange([])}
              className={`w-full text-left px-2.5 py-1.5 text-xs font-medium border-t border-gray-100 transition-colors ${a.link}`}
            >
              Clear {label.toLowerCase()} ({selected.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
