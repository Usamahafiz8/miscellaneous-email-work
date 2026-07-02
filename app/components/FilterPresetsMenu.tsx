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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-300 px-3 py-2 transition-colors whitespace-nowrap"
      >
        Presets{presets.length > 0 ? ` (${presets.length})` : ""}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1.5">
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
