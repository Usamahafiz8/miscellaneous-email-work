"use client";

import { useState, useRef, useEffect } from "react";
import MultiSelectFilter from "./MultiSelectFilter";

export interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (values: string[]) => void;
}

interface FilterBarProps {
  // The view's title/count block. It used to live in its own full-width header
  // strip above this bar; folding it in here removes an entire ~56px band of
  // chrome from every list view and hands that height to the rows.
  leading?: React.ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  // Lets the parent focus the search box from a keyboard shortcut ("/").
  searchInputRef?: React.RefObject<HTMLInputElement>;
  filters: FilterConfig[];
  onClearAll: () => void;
  // Page-level actions (Sync, overflow menu, presets) — pinned to the right end
  // of the same row as the filters.
  rightSlot?: React.ReactNode;
  // Non-checkbox filter controls (e.g. a date range picker, a sort select) that
  // don't fit FilterConfig's shape. Rendered inline when there's room, and
  // inside the collapsed popover when there isn't.
  extraFilters?: React.ReactNode;
  // Whether extraFilters currently has an active value — factored into the
  // Clear button and busyLabel below, since those can't inspect extraFilters' contents.
  extraFiltersActive?: boolean;
  // True whenever a request triggered by this bar (search debounce/fetch, a
  // filter pill change, pagination) hasn't landed yet — not just search.
  isLoading?: boolean;
  // Violet for Hiring/Candidates, indigo elsewhere — keeps each view's accent
  // consistent between its toolbar and its content.
  accent?: "indigo" | "violet";
  // Set by views whose list pane is narrow (a split view with the reading pane
  // open). Five filter buttons + a search box + the action cluster simply don't
  // fit in ~480px, and letting them wrap costs three rows of height — so they
  // collapse behind a single "Filters" button instead.
  compact?: boolean;
}

const ACCENT = {
  indigo: {
    ring: "focus:ring-indigo-500/20 focus:border-indigo-400",
    spinner: "text-indigo-400",
    text: "text-indigo-500",
    clear: "text-indigo-600 hover:text-indigo-800 border-indigo-200 bg-indigo-50",
    active: "border-indigo-300 bg-indigo-50 text-indigo-700",
    badge: "bg-indigo-600 text-white",
    check: "text-indigo-600 focus:ring-indigo-500",
  },
  violet: {
    ring: "focus:ring-violet-500/20 focus:border-violet-400",
    spinner: "text-violet-400",
    text: "text-violet-500",
    clear: "text-violet-600 hover:text-violet-800 border-violet-200 bg-violet-50",
    active: "border-violet-300 bg-violet-50 text-violet-700",
    badge: "bg-violet-600 text-white",
    check: "text-violet-600 focus:ring-violet-500",
  },
};

// The collapsed form of the filter row. Renders each filter's options directly
// as a checkbox group rather than nesting one dropdown inside another, so
// everything stays reachable in a single click from a 32px trigger.
function FiltersPopover({
  filters, extraFilters, onClearAll, accent,
}: {
  filters: FilterConfig[];
  extraFilters?: React.ReactNode;
  onClearAll: () => void;
  accent: "indigo" | "violet";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const a = ACCENT[accent];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const activeCount = filters.reduce((n, f) => n + f.selected.length, 0);

  function toggle(f: FilterConfig, value: string) {
    f.onChange(f.selected.includes(value) ? f.selected.filter((v) => v !== value) : [...f.selected, value]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Filter the list"
        className={`flex items-center gap-1 h-8 text-[13px] rounded-lg border px-2 transition-colors whitespace-nowrap
          ${activeCount > 0 ? `${a.active} font-medium` : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-1.447.894l-4-2A1 1 0 019 17v-4.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className={`text-[10px] font-bold min-w-[15px] text-center px-1 rounded-full ${a.badge}`}>{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-72 max-h-[65vh] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-xl z-30 animate-dropdown-in">
          {filters.map((f) => (
            <div key={f.key} className="border-b border-gray-100 last:border-b-0">
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{f.label}</p>
                {f.selected.length > 0 && (
                  <button onClick={() => f.onChange([])} className="text-[10px] text-gray-400 hover:text-gray-700">clear</button>
                )}
              </div>
              <div className={`pb-1.5 ${f.options.length > 12 ? "max-h-40 overflow-y-auto" : ""}`}>
                {f.options.length === 0 ? (
                  <p className="px-3 py-1 text-[11px] text-gray-400">No options</p>
                ) : (
                  f.options.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 px-3 py-1 text-[13px] text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.selected.includes(opt.value)}
                        onChange={() => toggle(f, opt.value)}
                        className={`rounded border-gray-300 ${a.check}`}
                      />
                      <span className="flex-1 truncate">{opt.label}</span>
                      {opt.count !== undefined && <span className="text-[11px] text-gray-400 tabular-nums">{opt.count}</span>}
                    </label>
                  ))
                )}
              </div>
            </div>
          ))}

          {extraFilters && (
            <div className="border-t border-gray-100 px-3 py-2 flex flex-wrap items-center gap-1.5">
              {extraFilters}
            </div>
          )}

          <div className="sticky bottom-0 border-t border-gray-100 bg-white px-3 py-1.5">
            <button onClick={() => { onClearAll(); setOpen(false); }} className="text-[11px] font-medium text-gray-500 hover:text-gray-800">
              Clear all filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FilterBar({
  leading, search, onSearchChange, searchPlaceholder = "Search…", searchInputRef,
  filters, onClearAll, rightSlot, extraFilters, extraFiltersActive, isLoading,
  accent = "indigo", compact = false,
}: FilterBarProps) {
  const hasActive = !!search.trim() || filters.some((f) => f.selected.length > 0) || !!extraFiltersActive;
  const busyLabel = search.trim() ? "Searching…" : (filters.some((f) => f.selected.length > 0) || extraFiltersActive) ? "Filtering…" : "Loading…";
  const a = ACCENT[accent];

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-white bar-pad flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
      {leading}

      <div className={`relative flex-1 ${compact ? "min-w-[110px] max-w-[220px]" : "min-w-[170px] max-w-[280px]"}`}>
        {isLoading ? (
          <svg className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin ${a.spinner}`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
        )}
        <input
          ref={searchInputRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className={`w-full h-8 pl-8 ${search ? "pr-7" : "pr-2"} text-[13px] rounded-lg border border-gray-200 bg-gray-50/70 focus:bg-white focus:outline-none focus:ring-2 transition-colors ${a.ring}`}
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isLoading && !compact && <span className={`text-[11px] font-medium animate-pulse ${a.text}`}>{busyLabel}</span>}

      {compact ? (
        <FiltersPopover filters={filters} extraFilters={extraFilters} onClearAll={onClearAll} accent={accent} />
      ) : (
        <>
          {filters.map((f) => (
            <MultiSelectFilter key={f.key} label={f.label} options={f.options} selected={f.selected} onChange={f.onChange} accent={accent} />
          ))}
          {extraFilters}
        </>
      )}

      {hasActive && !compact && (
        <button
          onClick={onClearAll}
          title="Clear every filter and the search box"
          className={`flex items-center gap-1 h-8 text-xs font-medium px-2 rounded-lg border transition-colors ${a.clear}`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear
        </button>
      )}

      {rightSlot && <div className="ml-auto flex items-center gap-1.5">{rightSlot}</div>}
    </div>
  );
}
