"use client";

import { useEffect } from "react";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Anywhere",
    items: [
      { keys: ["⌘", "K"], label: "Open the command palette — search email, jump, run actions" },
      { keys: ["?"], label: "Show this shortcut list" },
      { keys: ["F"], label: "Focus mode — hide the nav bar and reclaim its height" },
      { keys: ["D"], label: "Toggle compact / comfortable row density" },
      { keys: ["Esc"], label: "Close the open panel, dialog, or focus mode" },
    ],
  },
  {
    title: "Navigate",
    items: [
      { keys: ["G", "D"], label: "Go to Dashboard" },
      { keys: ["G", "I"], label: "Go to Inbox" },
      { keys: ["G", "H"], label: "Go to Hiring" },
      { keys: ["G", "J"], label: "Go to Jobs" },
      { keys: ["G", "C"], label: "Go to Candidate Sheet" },
    ],
  },
  {
    title: "Inbox & Hiring lists",
    items: [
      { keys: ["J"], label: "Open the next email / candidate" },
      { keys: ["K"], label: "Open the previous one" },
      { keys: ["/"], label: "Jump to the search box" },
      { keys: ["Esc"], label: "Close the reading pane and give the list the full width" },
    ],
  },
  {
    title: "Layout",
    items: [
      { keys: ["Drag"], label: "Drag the divider between the list and the reading pane to resize" },
      { keys: ["Dbl-click"], label: "Double-click the divider to reset it" },
      { keys: ["←", "→"], label: "With the divider focused, resize it with the arrow keys" },
    ],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md bg-white border border-gray-200 shadow-[0_1px_0_theme(colors.gray.200)] text-[11px] font-sans font-semibold text-gray-600">
      {children}
    </kbd>
  );
}

export default function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-[2px] animate-overlay-in" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="relative w-full max-w-2xl max-h-full overflow-y-auto bg-white rounded-2xl shadow-2xl ring-1 ring-gray-900/10 animate-modal-in"
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Keyboard shortcuts</h2>
            <p className="text-xs text-gray-400">Everything here also lives in the ⌘K palette</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-300 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6 p-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{group.title}</p>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-start gap-2.5">
                    <span className="flex items-center gap-1 flex-shrink-0 pt-px">
                      {item.keys.map((k) => <Key key={k}>{k}</Key>)}
                    </span>
                    <span className="text-xs text-gray-600 leading-relaxed">{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
