"use client";

import { useEffect } from "react";

export type ToastKind = "info" | "success" | "error" | "progress";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  // Sticky toasts stay until dismissed (or replaced) — used for long-running
  // sync progress, where a timed dismiss would hide the status mid-import.
  sticky?: boolean;
}

const STYLE: Record<ToastKind, { wrap: string; icon: JSX.Element }> = {
  info: {
    wrap: "bg-white border-indigo-200 text-gray-700",
    icon: (
      <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  success: {
    wrap: "bg-white border-emerald-200 text-gray-700",
    icon: (
      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  error: {
    wrap: "bg-white border-red-200 text-red-700",
    icon: (
      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 4.93l14.14 14.14M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  progress: {
    wrap: "bg-white border-indigo-200 text-gray-700",
    icon: <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />,
  },
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  // Non-sticky toasts self-dismiss. The timer is keyed to the message too, so
  // an updated message (e.g. "12 synced" → "40 synced") restarts the clock
  // rather than vanishing early on the original toast's schedule.
  useEffect(() => {
    if (toast.sticky) return;
    const ms = toast.kind === "error" ? 9000 : 5000;
    const t = setTimeout(() => onDismiss(toast.id), ms);
    return () => clearTimeout(t);
  }, [toast.id, toast.message, toast.sticky, toast.kind, onDismiss]);

  const style = STYLE[toast.kind];

  return (
    <div
      role="status"
      className={`animate-toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl border shadow-lg shadow-gray-900/5 px-3.5 py-2.5 text-sm max-w-sm ${style.wrap}`}
    >
      <span className="flex-shrink-0 mt-0.5">{style.icon}</span>
      <span className="flex-1 min-w-0 leading-snug break-words">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 -mr-1 text-gray-300 hover:text-gray-600 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Fixed overlay in the bottom-right corner. Deliberately *not* part of the
// document flow: the banners this replaces sat between the top bar and the
// view and pushed everything below them down every time a sync started, which
// both wasted vertical space and shifted whatever you were reading.
export default function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 items-end"
    >
      {toasts.map((t) => <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
