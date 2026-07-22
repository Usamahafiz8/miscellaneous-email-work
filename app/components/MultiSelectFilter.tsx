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
}

export default function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const active = selected.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-sm rounded-lg border px-3 py-2 transition-colors whitespace-nowrap
          ${active ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
      >
        {label}
        {active ? ` (${selected.length})` : ""}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-56 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1.5 max-h-72 overflow-y-auto animate-dropdown-in">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No options</p>
          ) : (
            options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="flex-1">{opt.label}</span>
                {opt.count !== undefined && <span className="text-xs text-gray-400">{opt.count}</span>}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
