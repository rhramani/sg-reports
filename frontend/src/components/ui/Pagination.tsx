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
}

/** How many page buttons to show on each side of the current page */
const SIBLING_COUNT = 1;
const DOTS = "ellipsis";

function getPageRange(current: number, total: number): (number | string)[] {
  const totalVisible = SIBLING_COUNT * 2 + 5; // first + last + siblings + current + 2 dots

  if (total <= totalVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
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
}: PaginationProps) {
  // Only render when there is more than one page (i.e. data > pageSize)
  if (totalPages <= 1) return null;

  const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  const pages = getPageRange(currentPage, totalPages);

  const btnBase =
    "inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg border text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18476A]/40 disabled:cursor-not-allowed disabled:opacity-40 select-none cursor-pointer";
  const btnGhost =
    "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 px-2";
  const btnActive =
    "border-[#18476A] bg-[#18476A] text-white shadow-sm shadow-[#18476A]/20 px-2";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className,
      )}
    >
      {/* Left — record count info */}
      <p className="text-[11px] font-medium text-slate-500 shrink-0">
        Showing{" "}
        <span className="font-bold text-slate-800">{from}</span>
        {" - "}
        <span className="font-bold text-slate-800">{to}</span> of{" "}
        <span className="font-bold text-slate-800">{totalCount}</span>{" "}
        {recordLabel}
      </p>

      {/* Right — controls */}
      <div className="flex items-center gap-1">
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
                disabled={loading}
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
