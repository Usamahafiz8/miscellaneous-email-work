"use client";

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
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

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function DataTable<T>({
  columns, renderRow, variant = "grid", rows, rowKey, onRowClick, isRowSelected,
  sort, onSortChange, selectable, selectedIds, onSelectionChange,
  bulkActions, pagination, isLoading, emptyState, fillHeight = true,
}: DataTableProps<T>) {
  const ids = rows.map(rowKey);
  const allSelected = !!selectable && ids.length > 0 && ids.every((id) => selectedIds?.has(id));
  const someSelected = !!selectable && ids.some((id) => selectedIds?.has(id));
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

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

  return (
    <div className={fillHeight ? "flex flex-col h-full" : "flex flex-col"}>
      {someSelected && bulkActions && bulkActions.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex-shrink-0 flex-wrap">
          <span className="text-xs font-semibold text-indigo-700 whitespace-nowrap">{selectedIds!.size} selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            {bulkActions.map((action) => (
              <button
                key={action.label}
                onClick={() => runBulkAction(action)}
                className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  action.variant === "danger"
                    ? "bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200"
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

      {isLoading && (
        <div className="h-0.5 w-full bg-indigo-100 overflow-hidden flex-shrink-0">
          <div className="h-full w-1/3 bg-indigo-500 animate-loading-bar" />
        </div>
      )}

      <div className={`${fillHeight ? "flex-1 overflow-auto" : ""} transition-opacity ${isLoading ? "opacity-50 pointer-events-none" : ""}`}>
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            {emptyState ?? <p className="text-sm text-gray-400">No results</p>}
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
                  className={`group flex items-center gap-3 px-4 py-2.5 transition-colors ${onRowClick ? "cursor-pointer" : ""} ${
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
          <table className="w-full table-fixed text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                {selectable && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                {(columns ?? []).map((col) => (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                      col.sortable ? "cursor-pointer select-none hover:text-gray-700" : ""
                    }`}
                    onClick={() => handleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && sort?.field === col.key && (
                        <svg
                          className={`w-3 h-3 transition-transform ${sort.order === "desc" ? "rotate-180" : ""}`}
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
                ))}
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
                    className={`transition-colors ${onRowClick ? "cursor-pointer" : ""} ${
                      selected ? "bg-indigo-50 border-l-2 border-l-indigo-500" : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds?.has(id) ?? false}
                          onChange={() => toggleOne(id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    {(columns ?? []).map((col) => (
                      <td key={col.key} className="px-4 py-3">
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 flex-shrink-0 text-xs text-gray-500 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={pagination.pageSize}
              onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))}
              className="text-xs rounded-lg border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <span>
            {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}
            –{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Prev
            </button>
            <span className="px-2">Page {pagination.page} of {totalPages}</span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
