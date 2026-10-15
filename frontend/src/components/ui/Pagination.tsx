import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  /** Current active page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Total record count */
  totalCount: number;
  /** Items shown per page */
  pageSize: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Optional label suffix, e.g. "records" or "logs" */
  recordLabel?: string;
  /** Whether data is loading (disables buttons) */
  loading?: boolean;
  /** Extra class on the root element */
  className?: string;
  /** Force render pagination bar even if totalPages <= 1 */
  showAlways?: boolean;
  /** Options for rows per page dropdown */
  pageSizeOptions?: number[];
  /** Callback when page size changes */
  onPageSizeChange?: (size: number) => void;
}

/** How many page buttons to show on each side of the current page */
const SIBLING_COUNT = 1;
const DOTS = "ellipsis";

function getPageRange(current: number, total: number): (number | string)[] {
  const totalVisible = SIBLING_COUNT * 2 + 5; // first + last + siblings + current + 2 dots

  if (total <= totalVisible) {
    return Array.from({ length: Math.max(1, total) }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - SIBLING_COUNT, 1);
  const rightSibling = Math.min(current + SIBLING_COUNT, total);

  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < total - 1;

  if (!showLeftDots && showRightDots) {
    const leftRange = Array.from({ length: 3 + 2 * SIBLING_COUNT }, (_, i) => i + 1);
    return [...leftRange, DOTS, total];
  }

  if (showLeftDots && !showRightDots) {
    const rightRange = Array.from(
      { length: 3 + 2 * SIBLING_COUNT },
      (_, i) => total - (3 + 2 * SIBLING_COUNT) + i + 1,
    );
    return [1, DOTS, ...rightRange];
  }

  const middleRange = Array.from(
    { length: rightSibling - leftSibling + 1 },
    (_, i) => leftSibling + i,
  );
  return [1, DOTS, ...middleRange, DOTS + "-right", total];
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  recordLabel = "records",
  loading = false,
  className,
  showAlways = false,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  // If not forcing showAlways, only render when there is more than one page
  if (totalPages <= 1 && !showAlways) return null;

  const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  const pages = getPageRange(currentPage, Math.max(1, totalPages));

  const btnBase =
    "inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg border text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18476A]/40 disabled:cursor-not-allowed disabled:opacity-40 select-none cursor-pointer";
  const btnGhost =
    "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white px-2";
  const btnActive =
    "border-[#18476A] bg-[#18476A] dark:border-cyan-600 dark:bg-cyan-600 text-white shadow-xs px-2";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-slate-200 dark:border-slate-700/80 bg-white/50 dark:bg-slate-850/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className,
      )}
    >
      {/* Left — record count info & optional page size */}
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
          Showing{" "}
          <span className="font-bold text-slate-800 dark:text-slate-200">{from}</span>
          {" - "}
          <span className="font-bold text-slate-800 dark:text-slate-200">{to}</span> of{" "}
          <span className="font-bold text-slate-800 dark:text-slate-200">{totalCount}</span>{" "}
          {recordLabel}
        </p>

        {pageSizeOptions && onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 px-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-hidden cursor-pointer shadow-2xs"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right — controls */}
      <div className="flex items-center gap-1 self-end sm:self-auto">
        {/* First page */}
        <button
          title="First page"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1 || loading}
          className={cn(btnBase, btnGhost)}
        >
          <ChevronsLeft size={14} />
        </button>

        {/* Previous */}
        <button
          title="Previous page"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || loading}
          className={cn(btnBase, btnGhost)}
        >
          <ChevronLeft size={14} />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-0.5">
          {pages.map((page, i) => {
            const isDots = typeof page === "string" && page.startsWith("ellipsis");
            if (isDots) {
              return (
                <span
                  key={`dots-${i}`}
                  className="inline-flex h-8 w-8 items-center justify-center text-xs text-slate-400 select-none"
                >
                  ...
                </span>
              );
            }
            return (
              <button
                key={page}
                onClick={() => onPageChange(page as number)}
                disabled={loading || totalPages <= 1}
                className={cn(
                  btnBase,
                  page === currentPage ? btnActive : btnGhost,
                )}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next */}
        <button
          title="Next page"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || loading}
          className={cn(btnBase, btnGhost)}
        >
          <ChevronRight size={14} />
        </button>

        {/* Last page */}
        <button
          title="Last page"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages || loading}
          className={cn(btnBase, btnGhost)}
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
