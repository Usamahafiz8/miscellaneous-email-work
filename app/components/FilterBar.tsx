"use client";

import MultiSelectFilter from "./MultiSelectFilter";

export interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (values: string[]) => void;
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters: FilterConfig[];
  onClearAll: () => void;
  rightSlot?: React.ReactNode;
  isSearching?: boolean;
}

export default function FilterBar({ search, onSearchChange, searchPlaceholder = "Search…", filters, onClearAll, rightSlot, isSearching }: FilterBarProps) {
  const hasActive = !!search.trim() || filters.some((f) => f.selected.length > 0);

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50/50 px-4 py-2.5 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        {isSearching ? (
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
        )}
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
        />
      </div>

      {isSearching && <span className="text-xs text-indigo-500 font-medium animate-pulse">Searching…</span>}

      {filters.map((f) => (
        <MultiSelectFilter key={f.key} label={f.label} options={f.options} selected={f.selected} onChange={f.onChange} />
      ))}

      {hasActive && (
        <button
          onClick={onClearAll}
          className="flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-800 px-2.5 py-2 rounded-lg border border-indigo-200 bg-indigo-50 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear
        </button>
      )}

      {rightSlot && <div className="ml-auto flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
