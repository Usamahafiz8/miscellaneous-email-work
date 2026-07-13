"use client";

import { useState, useRef, useEffect } from "react";

interface DateRangeFilterProps {
  dateFrom?: string;
  dateTo?: string;
  onApply: (dateFrom?: string, dateTo?: string) => void;
}

// Local calendar day, not toISOString().slice(0,10) — the latter is UTC-based
// and would shift "Today" to the wrong day depending on the operator's offset.
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoLocal(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatLabel(from?: string, to?: string): string {
  if (!from && !to) return "Date Range";
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  return `Until ${fmt(to!)}`;
}

export default function DateRangeFilter({ dateFrom, dateTo, onApply }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(dateFrom ?? "");
  const [draftTo, setDraftTo] = useState(dateTo ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function openMenu() {
    setDraftFrom(dateFrom ?? "");
    setDraftTo(dateTo ?? "");
    setOpen((o) => !o);
  }

  function quickPick(from?: string, to?: string) {
    onApply(from, to);
    setOpen(false);
  }

  function applyCustom() {
    onApply(draftFrom || undefined, draftTo || undefined);
    setOpen(false);
  }

  const active = !!(dateFrom || dateTo);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openMenu}
        className={`flex items-center gap-1.5 text-sm rounded-lg border px-3 py-2 transition-colors whitespace-nowrap
          ${active ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
      >
        {formatLabel(dateFrom, dateTo)}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-64 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-2 px-3">
          <div className="flex flex-col gap-1 mb-3">
            <button onClick={() => quickPick(todayLocal(), todayLocal())} className="text-left text-sm text-gray-700 hover:bg-gray-50 rounded px-2 py-1">Today</button>
            <button onClick={() => quickPick(daysAgoLocal(6), todayLocal())} className="text-left text-sm text-gray-700 hover:bg-gray-50 rounded px-2 py-1">Last 7 days</button>
            <button onClick={() => quickPick(daysAgoLocal(29), todayLocal())} className="text-left text-sm text-gray-700 hover:bg-gray-50 rounded px-2 py-1">Last 30 days</button>
            <button onClick={() => quickPick(undefined, undefined)} className="text-left text-sm text-gray-700 hover:bg-gray-50 rounded px-2 py-1">All time</button>
          </div>
          <div className="border-t border-gray-100 pt-2 flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Custom range</label>
            <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)}
              className="w-full text-sm rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
            <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)}
              className="w-full text-sm rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
            <button onClick={applyCustom} className="mt-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
