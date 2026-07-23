"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isTypingTarget, isCommandKey, markGPrefix, isGPrefixPending, consumeGPrefix } from "@/lib/keyboard";
import { useUIPrefs } from "./UIPrefsProvider";
import { useDashboard } from "./DashboardProvider";
import TopBar from "./TopBar";
import Toaster from "./ui/Toaster";
import CommandPalette from "./ui/CommandPalette";
import ShortcutsSheet from "./ui/ShortcutsSheet";

// `g` is a prefix: press it, then a destination key to jump (g-i → Inbox).
// The timing window itself lives in lib/keyboard so the list views can tell
// when a `j` belongs to "g j" rather than to their own row navigation.
const G_ROUTES: Record<string, string> = {
  d: "/", i: "/inbox", h: "/hiring", j: "/jobs", c: "/candidates",
};

interface AppChromeProps {
  accountEmail: string;
  onLogout: () => void;
  children: React.ReactNode;
}

// The authenticated app shell: top bar, global keyboard shortcuts, command
// palette, shortcut sheet and the toast stack. Split out of DashboardProvider
// so it can sit *inside* the dashboard context and read sync state / actions
// (the palette runs "Sync inbox" etc.) while the provider owns the data.
export default function AppChrome({ accountEmail, onLogout, children }: AppChromeProps) {
  const router = useRouter();
  const { density, focusMode, setFocusMode, toggleDensity, toggleFocusMode } = useUIPrefs();
  const { counts, isSyncing, toasts, dismissToast } = useDashboard();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openPalette = useCallback(() => { setShortcutsOpen(false); setPaletteOpen(true); }, []);
  const showShortcuts = useCallback(() => { setPaletteOpen(false); setShortcutsOpen(true); }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ⌘K works even from inside a search box — it's the one shortcut that
      // should always be reachable without first clicking away.
      if (isCommandKey(e, "k")) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      if (e.altKey || e.metaKey || e.ctrlKey) return;

      if (e.key === "Escape") {
        // Esc unwinds one layer at a time: dialogs first, then focus mode.
        // Closing an open reading pane is the views' job — they run first and
        // preventDefault when they handle it, so a single Esc never both closes
        // an email and drops you out of focus mode.
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (e.defaultPrevented) return;
        if (focusMode && !isTypingTarget(e.target)) { setFocusMode(false); return; }
        return;
      }

      if (paletteOpen || shortcutsOpen) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // `g` prefix — consume the follow-up key as a destination if it lands
      // inside the window, otherwise fall through to the normal shortcuts.
      if (isGPrefixPending()) {
        const dest = G_ROUTES[key];
        consumeGPrefix();
        if (dest) { e.preventDefault(); router.push(dest); return; }
      }
      if (key === "g") { markGPrefix(); return; }

      if (key === "?" || (key === "/" && e.shiftKey)) { e.preventDefault(); showShortcuts(); return; }
      if (key === "f") { e.preventDefault(); toggleFocusMode(); return; }
      if (key === "d") { e.preventDefault(); toggleDensity(); return; }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, paletteOpen, shortcutsOpen, focusMode, setFocusMode, toggleFocusMode, toggleDensity, showShortcuts]);

  return (
    <div data-density={density} className="flex flex-col h-screen bg-white overflow-hidden font-sans">
      {!focusMode && (
        <TopBar
          emailCount={counts.total}
          unreadCount={counts.unread}
          hiringCount={counts.hiring}
          accountEmail={accountEmail}
          onLogout={onLogout}
          onOpenPalette={openPalette}
          onShowShortcuts={showShortcuts}
        />
      )}

      {/* Sync progress is a 2px hairline instead of a full banner row — it
          reports the same thing without costing ~52px of vertical space or
          shifting the content underneath it. */}
      {isSyncing && (
        <div className="h-0.5 w-full bg-indigo-100 overflow-hidden flex-shrink-0" role="progressbar" aria-label="Syncing">
          <div className="h-full w-1/3 bg-indigo-500 animate-loading-bar" />
        </div>
      )}

      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Focus mode hides the nav entirely, so it needs its own always-visible
          way back out (besides Esc and ⌘K). */}
      {focusMode && (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          className="fixed bottom-4 left-4 z-[55] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900/85 hover:bg-gray-900 text-white text-xs font-medium shadow-lg backdrop-blur-sm transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
          </svg>
          Exit focus mode
          <kbd className="text-[10px] font-sans font-semibold bg-white/15 rounded px-1 py-px">Esc</kbd>
        </button>
      )}

      <Toaster toasts={toasts} onDismiss={dismissToast} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onShowShortcuts={showShortcuts}
        onLogout={onLogout}
      />
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
