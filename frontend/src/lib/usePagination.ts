import { useState, useEffect, useMemo } from "react";

/**
 * usePagination — reusable hook for client-side pagination.
 *
 * @param data        Full array of items to paginate
 * @param pageSize    How many items per page (default: 10)
 * @param resetDeps   Extra dependencies that should reset page back to 1
 *                    (e.g. search query, active module)
 *
 * @returns
 *   - pagedData      The slice of `data` for the current page
 *   - currentPage    Active page number (1-indexed)
 *   - totalPages     Total number of pages
 *   - totalCount     Total items count (same as data.length)
 *   - pageSize       Items per page
 *   - setCurrentPage Manual page setter
 *   - resetPage      Helper to jump back to page 1
 */
export function usePagination<T>(
  data: T[],
  pageSize = 10,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resetDeps: any[] = [],
) {
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 whenever data or any reset dependency changes
  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, ...resetDeps]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.length / pageSize)),
    [data.length, pageSize],
  );

  // Clamp current page in case data shrinks
  const safePage = Math.min(currentPage, totalPages);

  const pagedData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  const resetPage = () => setCurrentPage(1);

  return {
    pagedData,
    currentPage: safePage,
    totalPages,
    totalCount: data.length,
    pageSize,
    setCurrentPage,
    resetPage,
  };
}
