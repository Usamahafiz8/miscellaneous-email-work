"use client";

import { useMemo } from "react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  // Plain-English explanation shown on hover — for columns whose meaning
  // isn't obvious from the header alone (e.g. "Match", "Stage").
  headerHint?: string;
  sortable?: boolean;
  width?: string;
  // Right-aligns the header and cells — for numeric/score columns, which read
  // much faster when their digits line up.
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

export interface DataTableSort {
  field: string;
  order: "asc" | "desc";
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export interface DataTableBulkAction {
  label: string;
  onRun: (ids: string[]) => void;
  icon?: React.ReactNode;
  variant?: "default" | "danger";
}

interface DataTableProps<T> {
  // Required for variant "grid" (the default). Ignored for "list".
  columns?: ColumnDef<T>[];
  // Required for variant "list" — renders one flowing flex row per item (Gmail-style),
  // instead of a bordered per-column grid. DataTable still owns the shared mechanics
  // (checkbox/selection, click-to-open, bulk-action bar, pagination footer).
  renderRow?: (row: T) => React.ReactNode;
  variant?: "grid" | "list";
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  bulkActions?: DataTableBulkAction[];
  pagination?: DataTablePagination;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  // false for embedding in a naturally-sized card (e.g. Dashboard Home's compact
  // recent-emails list) — true (default) assumes a full-height flex parent, like
  // the Inbox/Hiring page panels, and lets the row area scroll internally.
  fillHeight?: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// Columns without an explicit width share whatever's left over; this is the
// floor we assume each of them needs when working out the table's minimum
// width (below which it scrolls horizontally instead of crushing text).
const FLEX_COLUMN_MIN = 180;

function parsePx(width: string | undefined): number | null {
  if (!width) return null;
  const m = /^(\d+(?:\.\d+)?)px$/.exec(width.trim());
  return m ? Number(m[1]) : null;
}

export default function DataTable<T>({
  columns, renderRow, variant = "grid", rows, rowKey, onRowClick, isRowSelected,
  sort, onSortChange, selectable, selectedIds, onSelectionChange,
  bulkActions, pagination, isLoading, emptyState, fillHeight = true,
}: DataTableProps<T>) {
  const ids = rows.map(rowKey);
  const allSelected = !!selectable && ids.length > 0 && ids.every((id) => selectedIds?.has(id));
  const someSelected = !!selectable && ids.some((id) => selectedIds?.has(id));
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  // The table used to be `table-fixed w-full`, which squeezed a 10-column grid
  // into whatever width was available — at 420px in a split view every column
  // collapsed to an unreadable sliver. Giving the table a real minimum width
  // lets it scroll sideways instead, so columns keep their intended size and
  // still stretch to fill a wide screen.
  const minTableWidth = useMemo(() => {
    if (variant !== "grid" || !columns) return undefined;
    const fixed = columns.reduce((sum, c) => sum + (parsePx(c.width) ?? FLEX_COLUMN_MIN), 0);
    return fixed + (selectable ? 40 : 0);
  }, [columns, selectable, variant]);

  function toggleAll() {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? new Set() : new Set(ids));
  }

  function toggleOne(id: string) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function handleSort(col: ColumnDef<T>) {
    if (!col.sortable || !onSortChange) return;
    onSortChange({
      field: col.key,
      order: sort?.field === col.key && sort.order === "asc" ? "desc" : sort?.field === col.key ? "asc" : "asc",
    });
  }

  function runBulkAction(action: DataTableBulkAction) {
    if (!selectedIds) return;
    action.onRun(Array.from(selectedIds));
    onSelectionChange?.(new Set());
  }

  // First load (or a filter change that cleared the list) shows shimmering
  // placeholder rows at the real row height, so the table doesn't collapse to
  // an empty box and then jump back to full height when the data lands.
  const showSkeleton = !!isLoading && rows.length === 0;
  const skeletonRows = Math.min(pagination?.pageSize ?? 10, 14);

  return (
    <div className={fillHeight ? "flex flex-col h-full min-h-0" : "flex flex-col"}>
      {someSelected && bulkActions && bulkActions.length > 0 && (
        <div className="flex items-center gap-2 bar-pad bg-indigo-50 border-b border-indigo-100 flex-shrink-0 flex-wrap">
          <span className="text-xs font-semibold text-indigo-700 whitespace-nowrap">{selectedIds!.size} selected</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {bulkActions.map((action) => (
              <button
                key={action.label}
                onClick={() => runBulkAction(action)}
                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                  action.variant === "danger"
                    ? "bg-white text-red-600 hover:bg-red-50 ring-1 ring-red-200"
                    : "bg-white text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-200"
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
          <button onClick={() => onSelectionChange?.(new Set())} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
            Clear selection
          </button>
        </div>
      )}

      {/* A hairline progress bar for refreshes on top of already-visible rows —
          the full skeleton is reserved for when there's nothing to show yet. */}
      {isLoading && !showSkeleton && (
        <div className="h-0.5 w-full bg-indigo-100 overflow-hidden flex-shrink-0">
          <div className="h-full w-1/3 bg-indigo-500 animate-loading-bar" />
        </div>
      )}

      <div className={fillHeight ? "flex-1 overflow-auto min-h-0" : "overflow-x-auto"}>
        {showSkeleton ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 row-pad" style={{ opacity: 1 - i * 0.055 }}>
                <div className="skeleton h-3 w-3 rounded-full flex-shrink-0" />
                <div className="skeleton h-3 flex-1" style={{ maxWidth: `${45 + ((i * 13) % 40)}%` }} />
                <div className="skeleton h-3 w-16 flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 px-4">
            {emptyState ?? <p className="text-sm text-gray-400">Nothing to show here yet</p>}
          </div>
        ) : variant === "list" ? (
          <div className="divide-y divide-gray-100">
            {rows.map((row) => {
              const id = rowKey(row);
              const selected = isRowSelected?.(row);
              const checked = selectedIds?.has(id) ?? false;
              return (
                <div
                  key={id}
                  onClick={() => onRowClick?.(row)}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                  className={`group flex items-center gap-3 row-pad transition-colors ${onRowClick ? "cursor-pointer" : ""} ${
                    selected ? "bg-indigo-50" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {selectable && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`flex-shrink-0 transition-opacity ${checked || someSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">{renderRow?.(row)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse" style={{ minWidth: minTableWidth }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50/95 backdrop-blur-sm">
                {selectable && (
                  <th className="head-pad w-10 border-b border-gray-200" title="Select all rows on this page">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all rows on this page"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                {(columns ?? []).map((col) => {
                  const isSorted = col.sortable && sort?.field === col.key;
                  return (
                    <th
                      key={col.key}
                      style={{ width: col.width }}
                      title={col.headerHint}
                      aria-sort={isSorted ? (sort!.order === "asc" ? "ascending" : "descending") : undefined}
                      className={`head-pad text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-b border-gray-200 ${
                        col.align === "right" ? "text-right" : "text-left"
                      } ${isSorted ? "text-indigo-600" : "text-gray-500"} ${
                        col.sortable ? "cursor-pointer select-none hover:text-indigo-600" : ""
                      }`}
                      onClick={() => handleSort(col)}
                    >
                      <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                        {col.header}
                        {col.headerHint && (
                          <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {col.sortable && (
                          // A permanently visible (faint) arrow marks which
                          // columns are sortable at all — previously the only
                          // way to find out was to click and see.
                          <svg
                            className={`w-3 h-3 transition-all ${isSorted ? "opacity-100" : "opacity-25"} ${
                              isSorted && sort!.order === "desc" ? "rotate-180" : ""
                            }`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const id = rowKey(row);
                const selected = isRowSelected?.(row);
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    role={onRowClick ? "button" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                    className={`transition-colors ${onRowClick ? "cursor-pointer" : ""} ${
                      selected
                        ? "bg-indigo-50 shadow-[inset_2px_0_0_theme(colors.indigo.500)]"
                        : "bg-white hover:bg-indigo-50/40"
                    }`}
                  >
                    {selectable && (
                      <td className="row-pad" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds?.has(id) ?? false}
                          onChange={() => toggleOne(id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    {(columns ?? []).map((col) => (
                      <td key={col.key} className={`row-pad row-text ${col.align === "right" ? "text-right" : ""}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination && (
        <div className="flex items-center justify-between gap-2 bar-pad border-t border-gray-200 flex-shrink-0 text-xs text-gray-500 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label htmlFor="rows-per-page" className="hidden sm:inline">Rows</label>
            <select
              id="rows-per-page"
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
              title="How many rows to show per page"
              className="text-xs rounded-lg border border-gray-200 px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <span className="tabular-nums">
            <strong className="font-semibold text-gray-700">
              {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}
              –{Math.min(pagination.page * pagination.pageSize, pagination.total)}
            </strong>{" "}
            of {pagination.total.toLocaleString()}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(1)}
              disabled={pagination.page <= 1}
              title="First page"
              aria-label="First page"
              className="px-1.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              ‹‹
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              title="Previous page"
              aria-label="Previous page"
              className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Prev
            </button>
            <span className="px-1.5 tabular-nums whitespace-nowrap">{pagination.page} / {totalPages}</span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              title="Next page"
              aria-label="Next page"
              className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
            <button
              onClick={() => pagination.onPageChange(totalPages)}
              disabled={pagination.page >= totalPages}
              title="Last page"
              aria-label="Last page"
              className="px-1.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              ››
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
