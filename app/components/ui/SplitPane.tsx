"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";

interface SplitPaneProps {
  // localStorage key the dragged width is persisted under, so the layout the
  // user set up survives reloads and navigations (per view — Inbox, Hiring and
  // Jobs each remember their own).
  storageKey: string;
  left: React.ReactNode;
  // When null the left pane takes the full width and no divider is rendered —
  // that's the "nothing selected, list owns the screen" state.
  right: React.ReactNode | null;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  // Reports the live width of the left pane (in px) so the parent can pick a
  // column set that actually fits — e.g. Inbox shows more columns as you drag
  // the list wider, instead of switching on a single hard-coded breakpoint.
  onLeftWidthChange?: (width: number) => void;
  className?: string;
}

export default function SplitPane({
  storageKey,
  left,
  right,
  defaultLeftWidth = 460,
  minLeftWidth = 260,
  minRightWidth = 380,
  onLeftWidthChange,
  className = "",
}: SplitPaneProps) {
  const isDesktop = useIsDesktop();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  // `right` is a ReactNode with a fresh identity on every parent render, so
  // effects below key off this boolean instead — otherwise they'd re-run (and
  // re-notify the parent) on every single render.
  const hasRight = right != null && right !== false;

  // Restore the persisted width after mount (localStorage isn't readable during
  // SSR, and a lazy initializer would desync server/client markup).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const n = saved ? Number(saved) : NaN;
      if (Number.isFinite(n) && n > 0) setWidth(n);
    } catch { /* storage disabled — keep the default */ }
  }, [storageKey]);

  // Clamp against the live container size so a width saved on a wide monitor
  // doesn't leave the reading pane unusably narrow on a laptop.
  const clamp = useCallback((px: number) => {
    const total = containerRef.current?.getBoundingClientRect().width ?? 0;
    if (total === 0) return px;
    const max = Math.max(minLeftWidth, total - minRightWidth);
    return Math.min(Math.max(px, minLeftWidth), max);
  }, [minLeftWidth, minRightWidth]);

  const commit = useCallback((px: number) => {
    const next = clamp(px);
    setWidth(next);
    try { window.localStorage.setItem(storageKey, String(Math.round(next))); } catch { /* ignore */ }
  }, [clamp, storageKey]);

  // Re-clamp on viewport resize — a window narrowed after the width was set
  // would otherwise keep a left pane wider than the whole container.
  useEffect(() => {
    if (!isDesktop || !hasRight) return;
    function onResize() { setWidth((w) => clamp(w)); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp, isDesktop, hasRight]);

  // Track the container's own width so the reported list width is real even
  // when the left pane isn't in a split (full-width list, or a phone). Reporting
  // Infinity there would tell the parent to render its widest column set on a
  // 390px screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // Re-attaches when the layout branch changes (single-pane ⇄ split), since
    // each branch mounts its own container element.
  }, [isDesktop, hasRight]);

  useEffect(() => {
    // In a desktop split the left pane is exactly `width`; otherwise it spans
    // whatever the container measures (0 until the first observation lands, so
    // fall back to the default rather than reporting a bogus "very narrow").
    onLeftWidthChange?.(hasRight && isDesktop ? width : (containerWidth || defaultLeftWidth));
  }, [width, hasRight, isDesktop, containerWidth, defaultLeftWidth, onLeftWidthChange]);

  // Pointer events (not mouse events) so the divider works with a trackpad,
  // a mouse, and a pen/touch drag alike. Capture keeps the drag alive even when
  // the pointer outruns the 8px-wide handle.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setWidth(clamp(e.clientX - box.left));
  }, [isDragging, clamp]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    commit(width);
  }, [isDragging, commit, width]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const STEP = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") { e.preventDefault(); commit(width - STEP); }
    else if (e.key === "ArrowRight") { e.preventDefault(); commit(width + STEP); }
    else if (e.key === "Home") { e.preventDefault(); commit(defaultLeftWidth); }
  }, [width, commit, defaultLeftWidth]);

  // Below md the two panes never share the screen — whichever one is "active"
  // takes the full width, matching how the views behaved before this component
  // existed (a 420px list beside a 350px reader is worse than either alone).
  if (!isDesktop) {
    return (
      <div ref={containerRef} className={`flex-1 flex overflow-hidden ${className}`}>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">{hasRight ? right : left}</div>
      </div>
    );
  }

  if (!hasRight) {
    return (
      <div ref={containerRef} className={`flex-1 flex overflow-hidden ${className}`}>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">{left}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex-1 flex overflow-hidden ${className}`}>
      <div
        className="flex flex-col overflow-hidden min-w-0"
        style={{ width, flex: "0 0 auto" }}
      >
        {left}
      </div>

      {/* Divider: a 1px line inside a 9px grab target. The wider hit area is
          what makes this comfortable to grab without a visually heavy bar. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize list and detail panes — drag, or use the arrow keys"
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => commit(defaultLeftWidth)}
        title="Drag to resize · double-click to reset"
        className={`group relative flex-shrink-0 w-[9px] cursor-col-resize select-none touch-none
          ${isDragging ? "bg-indigo-100" : "hover:bg-indigo-50"} transition-colors`}
      >
        <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors
          ${isDragging ? "bg-indigo-500" : "bg-gray-200 group-hover:bg-indigo-300"}`} />
        {/* Grip dots — a quiet affordance that this edge is draggable. */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] opacity-0 group-hover:opacity-100 transition-opacity">
          {[0, 1, 2].map((i) => <span key={i} className="w-[3px] h-[3px] rounded-full bg-indigo-400" />)}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">{right}</div>

      {/* While dragging, an invisible full-screen layer keeps the col-resize
          cursor and stops the pointer from selecting text or hovering rows
          underneath as it sweeps across the panes. */}
      {isDragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}
