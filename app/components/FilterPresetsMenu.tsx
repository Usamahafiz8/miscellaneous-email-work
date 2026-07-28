"use client";

import { useState, useRef, useEffect } from "react";
import { useFilterPresets } from "@/lib/useFilterPresets";

interface FilterPresetsMenuProps<T> {
  storageKey: string;
  currentFilters: T;
  onApply: (filters: T) => void;
}

export default function FilterPresetsMenu<T>({ storageKey, currentFilters, onApply }: FilterPresetsMenuProps<T>) {
  const { presets, savePreset, deletePreset } = useFilterPresets<T>(storageKey);
  const [open, setOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function apply(filters: T) {
    onApply(filters);
    setOpen(false);
  }

  function save() {
    if (!nameInput.trim()) return;
    savePreset(nameInput, currentFilters);
    setNameInput("");
  }

  return (
    <div className="relative" ref={ref}>
      {/* Icon-only trigger. Saved filter sets are useful but rarely clicked —
          as a 32px bookmark button it costs a fraction of the toolbar width the
          old "Presets (2) ▾" text button did. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Saved filter presets${presets.length > 0 ? ` (${presets.length})` : ""}`}
        title="Save the current filters, or reapply a saved set"
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
          open ? "border-gray-300 bg-gray-100 text-gray-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        {presets.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
            {presets.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1.5 animate-dropdown-in">
          {presets.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No saved presets yet</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {presets.map((p) => (
                <div key={p.name} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
                  <button onClick={() => apply(p.filters)} className="flex-1 text-left text-sm text-gray-700 truncate">
                    {p.name}
                  </button>
                  <button
                    onClick={() => deletePreset(p.name)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs leading-none flex-shrink-0"
                    title="Delete preset"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-3 pb-2 flex items-center gap-1.5">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
              placeholder="Save current as…"
              className="flex-1 min-w-0 text-sm rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
            />
            <button onClick={save} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
