import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  LayoutGrid,
  Minus,
  PieChart,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { authFetch, getAuthUser } from "@/lib/apiClient";
import type {
  HeaderLevel,
  HeaderStructure,
  MainHeaderGroup,
  MergedCellSpan,
  PermissionActions,
  ReportItem,
} from "@shared/api";

// ── Entry Color Palette System ─────────────────────────────────────────────
export type EntryColorPaletteKey =
  | "classic"
  | "ocean"
  | "mint"
  | "pastel"
  | "none";

export interface EntryPaletteBand {
  base: string;
  hover: string;
  border: string;
  badge: string;
}

export const ENTRY_COLOR_PALETTES: Record<
  EntryColorPaletteKey,
  {
    name: string;
    icon: string;
    description: string;
    bands: EntryPaletteBand[];
  }
> = {
  classic: {
    name: "Classic 2-Color (Default)",
    icon: "🌗",
    description: "2-color alternating white & soft light gray entries",
    bands: [
      {
        base: "bg-white",
        hover: "hover:bg-slate-100/70",
        border: "border-l-0",
        badge: "bg-slate-100 text-slate-700 border-slate-200",
      },
      {
        base: "bg-[#f4f6f8]",
        hover: "hover:bg-[#e9ecef]",
        border: "border-l-0",
        badge: "bg-slate-200 text-slate-800 border-slate-300",
      },
    ],
  },
  ocean: {
    name: "2-Color Soft Blue",
    icon: "🌊",
    description: "2-color alternating white & subtle blue entries",
    bands: [
      {
        base: "bg-white",
        hover: "hover:bg-sky-50/70",
        border: "border-l-0",
        badge: "bg-sky-50 text-sky-700 border-sky-200",
      },
      {
        base: "bg-[#f0f7ff]",
        hover: "hover:bg-[#e1f0ff]",
        border: "border-l-0",
        badge: "bg-sky-100 text-sky-800 border-sky-300",
      },
    ],
  },
  mint: {
    name: "2-Color Soft Mint",
    icon: "🌿",
    description: "2-color alternating white & soft mint green entries",
    bands: [
      {
        base: "bg-white",
        hover: "hover:bg-emerald-50/60",
        border: "border-l-0",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      },
      {
        base: "bg-[#f0fdf4]",
        hover: "hover:bg-[#dcfce7]",
        border: "border-l-0",
        badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
      },
    ],
  },
  pastel: {
    name: "2-Color Soft Pastel",
    icon: "🎨",
    description: "2-color alternating soft blue & warm amber entries",
    bands: [
      {
        base: "bg-[#f4f8ff]",
        hover: "hover:bg-[#e6f0ff]",
        border: "border-l-0",
        badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
      },
      {
        base: "bg-[#fff9f0]",
        hover: "hover:bg-[#fff2e0]",
        border: "border-l-0",
        badge: "bg-amber-100 text-amber-800 border-amber-200",
      },
    ],
  },
  none: {
    name: "Monochrome (Off)",
    icon: "⚪",
    description: "Standard plain white table rows",
    bands: [
      {
        base: "bg-white",
        hover: "hover:bg-slate-50",
        border: "border-l-0",
        badge: "bg-slate-100 text-slate-600 border-slate-200",
      },
    ],
  },
};

export function getEntryBandStyle(
  groupId: number,
  paletteKey: EntryColorPaletteKey = "classic",
): EntryPaletteBand {
  const palette =
    ENTRY_COLOR_PALETTES[paletteKey] || ENTRY_COLOR_PALETTES.classic;
  const safeGroupId = Math.max(0, Math.floor(groupId || 0));
  const idx = safeGroupId % palette.bands.length;
  return palette.bands[idx];
}

// ── Shared row-grouping helpers ──────────────────────────────────────────────
// These work generically across every report type (Journal, Bank Book, Metal
// Issue, Melting, etc.) because in each one, SOME cell in a subtotal row ends
// with the word "Total" — even though which column carries it differs per file.

const isSubtotalRow = (row: Record<string, any>, columns: string[]) =>
  columns.some((col) => /total\s*$/i.test(String(row[col] ?? "").trim()));

const parseNumeric = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (
    str === "" ||
    str === "—" ||
    str === "-" ||
    str === "None" ||
    str === "null" ||
    str === "undefined"
  ) {
    return null;
  }
  // If string contains alphabetic characters (e.g. MC/26-27/0096, G22KT, YELLOW ALLOY, JV-001), it is not a numeric measure
  if (/[a-zA-Z]/.test(str)) return null;

  // If string matches date pattern (e.g. 01/08/2026, 2026-08-01, 01-08-2026), it is not a numeric measure
  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(str)) return null;

  // Clean formatting characters like commas or spaces
  const cleaned = str.replace(/[, \s]/g, "");

  // Must be a valid floating point number
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

/**
 * Finds the column that behaves like an "entry label": blank on continuation
 * rows, filled when a new entry starts, and — the key safety check — most of
 * its runs actually end in a subtotal row. That last check is what stops it
 * from mis-firing on a flat file (e.g. a plain cash ledger) where some column
 * happens to be sometimes-blank (like a Remarks field) but isn't a real
 * grouping column.
 */
function detectGroupKeyColumn(
  rows: Record<string, any>[],
  columns: string[],
): string | null {
  if (!rows.length || !columns.length) return null;

  // Helper: check a candidate column has values AND is not constant (all rows same)
  const isUsableKey = (col: string) => {
    const vals = rows
      .filter((r) => !isSubtotalRow(r, columns))
      .map((r) => String(r[col] ?? "").trim())
      .filter((v) => v !== "" && v !== "—");
    if (vals.length === 0) return false;
    const uniqueVals = new Set(vals);
    if (uniqueVals.size === 1) return false;
    return true;
  };

  // When the first column is a "Book" column, the user explicitly wants
  // background color to be driven by the SECOND column (the one immediately
  // after Book), NOT by a heuristically detected voucher/transaction column.
  // Walk through columns in order (skipping all Book-named columns and
  // numeric/amount columns) and use the first one that has multiple distinct
  // values — i.e. literally the next meaningful text column after Book.
  const firstColIsBook = /^book/i.test(columns[0]?.trim() ?? "");
  if (firstColIsBook) {
    const nonBookCols = columns.filter((c) => !/^book/i.test(c.trim()));
    for (const col of nonBookCols) {
      // Skip purely numeric / amount / weight columns
      if (
        /wt|weight|fine|amt|amount|price|credit|debit|cost|balance|qty|quantity|piece|pcs/i.test(
          col,
        )
      ) {
        continue;
      }
      if (isUsableKey(col)) return col;
    }
    // If every non-Book text column is constant, fall through to normal detection
  }

  // Standard heuristic detection for reports whose first column is NOT Book
  // 1. Highest-priority: explicit transaction/voucher identifier columns
  const txnCol = columns.find((c) =>
    /voucher|transaction\s*no|trans\s*no|vou\.?\s*no|entry\s*no|ref\s*no|doc\s*no|journal\s*no|bill\s*no|inv\s*no|sr\.?\s*no|sl\.?\s*no/i.test(
      c.trim(),
    ),
  );
  if (txnCol && isUsableKey(txnCol)) return txnCol;

  // 2. Broader transaction/voucher keyword match
  const broadTxnCol = columns.find((c) =>
    /voucher|transaction|trans/i.test(c.trim()),
  );
  if (broadTxnCol && isUsableKey(broadTxnCol)) return broadTxnCol;

  // 3. Party / account / name columns (lower priority)
  const partyCol = columns.find(
    (c) =>
      /party|account|name/i.test(c.trim()) &&
      !/wt|weight|fine|amt|amount|price|cost|balance|piece|pcs|qty/i.test(
        c.trim(),
      ),
  );
  if (partyCol && isUsableKey(partyCol)) return partyCol;

  // 4. Entry/ref/doc/journal columns
  const entryCol = columns.find((c) =>
    /entry\b|ref\b|doc\b|journal\b|bill\b|inv\b/i.test(c.trim()),
  );
  if (entryCol && isUsableKey(entryCol)) return entryCol;

  // 5. Fallback: any non-numeric column with partial (sparse) fill pattern
  for (const col of columns) {
    if (
      /wt|weight|fine|amt|amount|price|credit|debit|cost|balance|qty|quantity|piece|pcs/i.test(
        col,
      )
    ) {
      continue;
    }

    let filled = 0;
    let blank = 0;
    rows.forEach((r) => {
      if (isSubtotalRow(r, columns)) return;
      String(r[col] ?? "").trim() === "" ? blank++ : filled++;
    });
    const total = filled + blank;
    if (total === 0 || blank === 0 || filled === 0) continue;
    const fillRatio = filled / total;
    if (fillRatio >= 0.05 && fillRatio <= 0.95) return col;
  }

  return null;
}

interface GroupedRowMeta {
  groupId: number;
  isTotalRow: boolean;
}

function computeRowGroups(
  rows: Record<string, any>[],
  columns: string[],
  groupKeyColumn: string | null,
): Map<number, GroupedRowMeta> {
  const meta = new Map<number, GroupedRowMeta>();
  if (!rows.length) return meta;

  // 1. Grouping when an explicit key column exists
  if (groupKeyColumn) {
    let groupId = -1;
    let lastSeenVal = "";

    rows.forEach((r, i) => {
      const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
      const isTotal = isSubtotalRow(r, columns);
      const v = String(r[groupKeyColumn] ?? "").trim();

      if (isTotal) {
        meta.set(idx, { groupId: Math.max(0, groupId), isTotalRow: true });
        return;
      }

      if (v !== "") {
        if (v !== lastSeenVal || groupId === -1) {
          groupId++;
          lastSeenVal = v;
        }
      } else {
        if (groupId === -1) groupId = 0;
      }

      meta.set(idx, { groupId, isTotalRow: false });
    });

    return meta;
  }

  // 2. Fallback: Search for any transaction/voucher column
  const fallbackKeyCol = columns.find((c) =>
    /voucher|transaction|trans|vou|entry|ref|doc|journal|bill|inv|sr|sl|date|party/i.test(
      c,
    ),
  );

  if (fallbackKeyCol) {
    let groupId = -1;
    let lastVal = "";

    rows.forEach((r, i) => {
      const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
      const isTotal = isSubtotalRow(r, columns);
      const v = String(r[fallbackKeyCol] ?? "").trim();

      if (isTotal) {
        meta.set(idx, { groupId: Math.max(0, groupId), isTotalRow: true });
        return;
      }

      if (v !== "" && v !== lastVal) {
        groupId++;
        lastVal = v;
      }
      if (groupId === -1) groupId = 0;

      meta.set(idx, { groupId, isTotalRow: false });
    });

    return meta;
  }

  // 3. Sequential row entry grouping (alternating entry IDs for standalone rows)
  rows.forEach((r, i) => {
    const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
    meta.set(idx, { groupId: i, isTotalRow: isSubtotalRow(r, columns) });
  });

  return meta;
}

function detectNumericColumns(rows: Record<string, any>[], columns: string[]) {
  return columns.filter((col) => {
    // Explicitly exclude columns whose names denote text identifiers or non-measure attributes
    if (
      /trans|voucher|vou|doc|ref|no|num|code|id|item|name|book|party|account|date|time|phone|mobile|sr|sl|serial|loss|brk|miss|type|status|narration|remarks/i.test(
        col,
      ) &&
      !/wt|weight|fine|amt|amount|price|cost|balance|piece|pcs|qty|quantity/i.test(
        col,
      )
    ) {
      return false;
    }

    // Include columns whose names explicitly denote numeric measure quantities
    if (
      /wt|weight|fine|amt|amount|price|credit|debit|cost|balance|piece|pcs|qty|quantity/i.test(
        col,
      )
    ) {
      return true;
    }

    const nonTotalRows = rows.filter((r) => !isSubtotalRow(r, columns));
    const sample = nonTotalRows.slice(0, 30);
    if (!sample.length) return false;

    const numericCount = sample.filter(
      (r) => parseNumeric(r[col]) !== null,
    ).length;
    return numericCount > sample.length * 0.6;
  });
}

/**
 * Automatically populates blank non-numeric header/metadata fields in sub-entries
 * using corresponding values from the main entry and running header context.
 */
export function fillSubEntriesFromMain(
  rows: Record<string, any>[],
  columns: string[],
): Record<string, any>[] {
  if (!rows.length) return rows;

  const groupKeyCol = detectGroupKeyColumn(rows, columns);
  const transactionKeyCol =
    columns.find((c) =>
      /transaction|voucher|entry|reference|document|journal|vou\.?no|transno|book\s*name/i.test(
        c,
      ),
    ) || columns[0];

  const isNumericCol = (col: string) =>
    /wt|weight|fine|amt|amount|price|credit|debit|total|cost|balance|qty|quantity|piece|pcs/i.test(
      col,
    );

  // Global running header context across the report (e.g. Book Name, Date, Party)
  const runningHeaderContext: Record<string, string> = {};

  let currentTransKeyVal = "";
  let currentMainEntry: Record<string, any> | null = null;

  return rows.map((row) => {
    // Leave subtotal rows untouched
    if (isSubtotalRow(row, columns)) {
      return { ...row };
    }

    // Update running header context with any non-blank header values found in this row
    for (const col of columns) {
      if (isNumericCol(col)) continue;
      const val = String(row[col] ?? "").trim();
      if (val !== "" && val !== "—") {
        if (
          /book|date|party|account|source|owner|company|branch|loss|brk|miss/i.test(
            col,
          )
        ) {
          runningHeaderContext[col] = val;
        }
      }
    }

    const groupVal = groupKeyCol ? String(row[groupKeyCol] ?? "").trim() : "";
    const transVal = transactionKeyCol
      ? String(row[transactionKeyCol] ?? "").trim()
      : "";

    const activeKeyVal = groupKeyCol ? groupVal : transVal;

    // A new transaction/entry group begins when activeKeyVal is non-empty and DIFFERENT from previous group
    const isNewGroup =
      activeKeyVal !== "" && activeKeyVal !== currentTransKeyVal;

    if (isNewGroup || currentMainEntry === null) {
      currentTransKeyVal = activeKeyVal;
      // Start a new main entry block, merging any available running header context
      const newMain = { ...row };
      for (const [hCol, hVal] of Object.entries(runningHeaderContext)) {
        const cVal = String(newMain[hCol] ?? "").trim();
        if (cVal === "" || cVal === "—") {
          newMain[hCol] = hVal;
        }
      }
      currentMainEntry = newMain;
      return newMain;
    }

    // It's a sub-entry within the current transaction/group block:
    // Fill blank non-numeric fields from currentMainEntry and runningHeaderContext
    const filledRow = { ...row };

    // 1. Fill from currentMainEntry
    for (const col of Object.keys(currentMainEntry)) {
      if (col === "_originalIndex") continue;
      if (isNumericCol(col)) continue;

      const currentVal = String(filledRow[col] ?? "").trim();
      const mainVal = String(currentMainEntry[col] ?? "").trim();
      if (
        (currentVal === "" || currentVal === "—") &&
        mainVal !== "" &&
        mainVal !== "—"
      ) {
        filledRow[col] = mainVal;
      }
    }

    // 2. Fill from runningHeaderContext for any remaining blank header fields
    for (const [hCol, hVal] of Object.entries(runningHeaderContext)) {
      if (isNumericCol(hCol)) continue;
      const currentVal = String(filledRow[hCol] ?? "").trim();
      if (
        (currentVal === "" || currentVal === "—") &&
        hVal !== "" &&
        hVal !== "—"
      ) {
        filledRow[hCol] = hVal;
      }
    }

    return filledRow;
  });
}

/**
 * Helper to check if a row represents an ALLOY item (e.g. "ALLOY", "YELLOW ALLOY", "WHITE ALLOY").
 */
export function isAlloyItem(row: Record<string, any>): boolean {
  if (!row) return false;
  const keysToCheck = Object.keys(row).filter((k) =>
    /item|description|product|particular/i.test(k),
  );
  if (keysToCheck.length === 0) keysToCheck.push("Item", "item", "ITEM");

  return keysToCheck.some((key) => {
    const val = String(row[key] ?? "")
      .trim()
      .toUpperCase();
    return val.includes("ALLOY");
  });
}

/**
 * Sets OUT side Pure Wt to "0" for ALLOY items in melting reports.
 */
export function zeroAlloyOutPureWeight(
  rows: Record<string, any>[],
  columns: string[],
): Record<string, any>[] {
  if (!rows.length) return rows;

  return rows.map((row) => {
    if (!isAlloyItem(row)) return row;

    const updated = { ...row };

    // 1. Target any explicit OUT side Pure Wt column (e.g. "Pure Wt (2)", "Out Pure Wt", "Pure Wt_1", etc.)
    const outPureCols = Object.keys(updated).filter((col) =>
      /\b(out|side2|\(2\)|_1|_2)\b.*pure|pure.*(out|side2|\(2\)|_1|_2)|\bpure\s*wt\s*\(2\)|\bout\s*pure\s*wt|\bpure\s*weight\s*\(2\)/i.test(
        col,
      ),
    );

    outPureCols.forEach((col) => {
      updated[col] = "0";
    });

    // 2. If this row is a Side 2 (OUT) row, set any standard "Pure Wt" or "Pure Weight" column on this row to "0"
    const hasOutWeight = Object.keys(updated).some(
      (col) =>
        /\(2\)|_2|\s2$|credit|out/i.test(col) &&
        parseNumeric(updated[col]) !== null &&
        parseNumeric(updated[col]) !== 0,
    );
    const isSide2Row =
      hasOutWeight ||
      String(updated["InOut"] || updated["P.Type"] || updated["Type"] || "")
        .toUpperCase()
        .includes("OUT");

    if (isSide2Row) {
      Object.keys(updated).forEach((col) => {
        if (/pure\s*wt|pure\s*weight/i.test(col)) {
          updated[col] = "0";
        }
      });
    }

    return updated;
  });
}

/**
 * Detects rows that contain two merged entries (e.g., both Side 1 measures like WEIGHT/DEBIT
 * and Side 2 measures like WEIGHT (2)/CREDIT populated) and splits them into separate rows.
 */
export function splitMergedEntries(
  rows: Record<string, any>[],
  columns: string[],
): Record<string, any>[] {
  if (!rows.length) return rows;

  const side1Cols = columns.filter(
    (col) =>
      /wt|weight|fine|amt|amount|price|debit|piece|pcs|qty|quantity/i.test(
        col,
      ) && !/\(2\)|_2|\s2$|credit|out/i.test(col),
  );

  const side2Cols = columns.filter((col) =>
    /\(2\)|_2|\s2$|credit|out/i.test(col),
  );

  if (!side1Cols.length || !side2Cols.length) {
    return zeroAlloyOutPureWeight(rows, columns);
  }

  const result: Record<string, any>[] = [];

  rows.forEach((row) => {
    if (isSubtotalRow(row, columns)) {
      result.push(row);
      return;
    }

    const hasSide1Value = side1Cols.some((col) => {
      const n = parseNumeric(row[col]);
      return n !== null && n !== 0;
    });

    const hasSide2Value = side2Cols.some((col) => {
      const n = parseNumeric(row[col]);
      return n !== null && n !== 0;
    });

    if (hasSide1Value && hasSide2Value) {
      // Row A: Side 1 entry (clear Side 2 measure columns)
      const rowA: Record<string, any> = { ...row };
      side2Cols.forEach((col) => {
        rowA[col] = "";
      });

      // Row B: Side 2 entry (clear Side 1 measure columns)
      const rowB: Record<string, any> = { ...row };
      side1Cols.forEach((col) => {
        rowB[col] = "";
      });

      result.push(rowA);
      result.push(rowB);
    } else {
      result.push(row);
    }
  });

  const sanitizedAlloyResult = zeroAlloyOutPureWeight(result, columns);

  return sanitizedAlloyResult.map((r, i) => ({
    ...r,
    _originalIndex: i,
  }));
}

// Two alternating pastel bands for regular entries, with a slightly deeper
// shade of the same hue reserved for that entry's own subtotal row so it
// still reads as "part of the same block" rather than a break in it.
const GROUP_BANDS = [
  { base: "bg-white", total: "bg-slate-100" },
  { base: "bg-[#eef4fb]", total: "bg-[#d9e8f7]" },
];

export function calculateRowPurity(
  row: Record<string, any>,
  columns: string[],
  groupIndices?: number[],
  allRows?: Record<string, any>[],
): string {
  // 1. Check if row already has a manually entered or uploaded Purity value
  const purityKey = columns.find((c) => /purity/i.test(c.trim()));
  if (purityKey && row[purityKey] !== undefined && row[purityKey] !== null) {
    const rawVal = String(row[purityKey]).trim();
    if (
      rawVal !== "" &&
      rawVal !== "—" &&
      rawVal !== "-" &&
      rawVal.toLowerCase() !== "null" &&
      rawVal.toLowerCase() !== "undefined"
    ) {
      const cleaned = rawVal.replace(/%/g, "").trim();
      const num = Number(cleaned);
      if (Number.isFinite(num)) {
        return rawVal.includes("%") ? rawVal : `${num.toFixed(2)}%`;
      }
      return rawVal;
    }
  }

  const parseNum = (value: any): number => {
    if (value === null || value === undefined) return 0;

    const str = String(value).trim();

    if (
      str === "" ||
      str === "—" ||
      str === "-" ||
      str.toLowerCase() === "null" ||
      str.toLowerCase() === "undefined"
    ) {
      return 0;
    }

    const cleaned = str.replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const num = Number(cleaned);

    return Number.isFinite(num) ? num : 0;
  };

  const findColumn = (
    exactNames: string[],
    fallbackRegex: RegExp,
  ): string | undefined => {
    for (const name of exactNames) {
      const found = columns.find(
        (column) => column.trim().toLowerCase() === name.toLowerCase(),
      );
      if (found) return found;
    }
    return columns.find((column) => fallbackRegex.test(column.trim()));
  };

  const inWeightColumn =
    findColumn(["Weight"], /^weight$/i) ||
    columns.find((c) => /in.*wt|weight/i.test(c));

  let outPureWeightColumn =
    findColumn(
      ["Pure Wt (2)", "Pure Weight (2)"],
      /^pure\s*(wt|weight)\s*\(2\)$/i,
    ) ||
    columns.find((c) => /out.*pure|pure.*\(2\)|pure.*out/i.test(c)) ||
    columns.find((c) => /pure\s*(wt|weight)/i.test(c));

  // Check single row first if row has IN weight and OUT pure weight directly
  if (inWeightColumn && outPureWeightColumn) {
    const inWt = parseNum(row[inWeightColumn]);
    const outPureWt = parseNum(row[outPureWeightColumn]);
    if (inWt > 0 && outPureWt > 0) {
      const p = (outPureWt / inWt) * 100;
      return `${p.toFixed(2)}%`;
    }
  }

  let targetRows: Record<string, any>[] = [];

  const transNoColumn = columns.find((column) =>
    /^transno$/i.test(column.trim()),
  );

  if (allRows && allRows.length > 0 && transNoColumn) {
    const currentTransNo = String(row[transNoColumn] ?? "").trim();

    if (currentTransNo) {
      targetRows = allRows.filter(
        (item) => String(item[transNoColumn] ?? "").trim() === currentTransNo,
      );
    }
  }

  if (
    targetRows.length === 0 &&
    groupIndices &&
    groupIndices.length > 0 &&
    allRows &&
    allRows.length > 0
  ) {
    targetRows = groupIndices.map((index) => allRows[index]).filter(Boolean);
  }

  if (targetRows.length === 0) {
    targetRows = [row];
  }

  let totalInWeight = 0;
  let totalOutPureWeight = 0;

  targetRows.forEach((currentRow) => {
    const itemColumn = columns.find((column) =>
      /^(item|description|product|particular)$/i.test(column.trim()),
    );

    const itemName = itemColumn
      ? String(currentRow[itemColumn] ?? "")
          .trim()
          .toUpperCase()
      : "";

    if (inWeightColumn) {
      const weight = parseNum(currentRow[inWeightColumn]);

      if (weight > 0) {
        totalInWeight += weight;
      }
    }

    if (itemName.includes("ALLOY")) {
      return;
    }

    if (outPureWeightColumn) {
      const outPureWeight = parseNum(currentRow[outPureWeightColumn]);

      if (outPureWeight > 0) {
        totalOutPureWeight += outPureWeight;
      }
    }
  });

  if (totalInWeight <= 0) {
    return "—";
  }

  const purity = (totalOutPureWeight / totalInWeight) * 100;

  return `${purity.toFixed(2)}%`;
}

export function calculateOverallPurity(
  targetRows: Record<string, any>[],
  columns: string[],
): string {
  if (!targetRows || targetRows.length === 0) return "—";

  const purityKey = columns.find((c) => /purity/i.test(c.trim()));

  const parseNum = (value: any): number => {
    if (value === null || value === undefined) return 0;
    const str = String(value).trim();
    if (
      str === "" ||
      str === "—" ||
      str === "-" ||
      str.toLowerCase() === "null" ||
      str.toLowerCase() === "undefined"
    ) {
      return 0;
    }
    const cleaned = str.replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  // If target rows have manually entered Purity values, average them
  if (purityKey) {
    let sum = 0;
    let count = 0;
    targetRows.forEach((r) => {
      const val = parseNum(r[purityKey]);
      if (val > 0) {
        sum += val;
        count++;
      }
    });
    if (count > 0) {
      return `${(sum / count).toFixed(2)}%`;
    }
  }

  const findColumn = (
    exactNames: string[],
    fallbackRegex: RegExp,
  ): string | undefined => {
    for (const name of exactNames) {
      const found = columns.find(
        (column) => column.trim().toLowerCase() === name.toLowerCase(),
      );
      if (found) return found;
    }
    return columns.find((column) => fallbackRegex.test(column.trim()));
  };

  const inWeightColumn = findColumn(["Weight"], /^weight$/i);
  const outPureWeightColumn = findColumn(
    ["Pure Wt (2)", "Pure Weight (2)"],
    /^pure\s*(wt|weight)\s*\(2\)$/i,
  );
  const itemColumn = columns.find((column) =>
    /^(item|description|product|particular)$/i.test(column.trim()),
  );

  let totalInWeight = 0;
  let totalOutPureWeight = 0;

  targetRows.forEach((currentRow) => {
    const itemName = itemColumn
      ? String(currentRow[itemColumn] ?? "")
          .trim()
          .toUpperCase()
      : "";

    if (inWeightColumn) {
      const weight = parseNum(currentRow[inWeightColumn]);
      if (weight > 0) {
        totalInWeight += weight;
      }
    }

    if (itemName.includes("ALLOY")) {
      return;
    }

    if (outPureWeightColumn) {
      const outPureWeight = parseNum(currentRow[outPureWeightColumn]);
      if (outPureWeight > 0) {
        totalOutPureWeight += outPureWeight;
      }
    }
  });

  if (totalInWeight <= 0) {
    return "—";
  }

  const purity = (totalOutPureWeight / totalInWeight) * 100;
  return `${purity.toFixed(2)}%`;
}

/**
 * Re-groups a header level's columns against the column order actually
 * being rendered (`displayColumns`), rather than trusting the level's
 * stored colSpans directly. This lets a column that isn't part of any
 * stored group — e.g. a computed "Purity" column inserted between the IN
 * and OUT groups — take its correct position and colSpan automatically:
 *
 * - If the columns on either side of it belong to the SAME group (e.g. an
 *   outer "On Hand" group that wraps both IN and OUT), it's folded into
 *   that group, extending its colSpan by one.
 * - If the columns on either side belong to DIFFERENT groups (the actual
 *   IN/OUT split), it renders as its own standalone, untitled cell between
 *   them.
 *
 * This keeps every level's colSpans summing exactly to displayColumns.length
 * with no separate "missing span" filler cell required.
 */
export function buildDisplayHeaderGroups(
  groups: MainHeaderGroup[],
  displayColumns: string[],
  extraColumnKey: string = "Purity",
): { title: string; colSpan: number; rowSpan?: number }[] {
  const groupByKey = new Map<string, MainHeaderGroup>();
  groups.forEach((g) => {
    g.columns.forEach((c) => groupByKey.set(c.key, g));
  });

  const result: { title: string; colSpan: number; rowSpan?: number }[] = [];
  const pushOrExtend = (group?: MainHeaderGroup) => {
    const title = group?.title ?? "";
    const rowSpan = group?.rowSpan ?? 1;
    const last = result[result.length - 1];
    if (last && last.title === title) {
      last.colSpan += 1;
    } else {
      result.push({ title, colSpan: 1, rowSpan });
    }
  };

  displayColumns.forEach((colKey) => {
    if (colKey === extraColumnKey) {
      pushOrExtend(undefined);
      return;
    }
    pushOrExtend(groupByKey.get(colKey));
  });

  return result;
}

export interface AnalyzedXlsxResult {
  headers: string[];
  parsed: Record<string, any>[];
  headerStructure: HeaderStructure;
  layoutMode: "ledger" | "melting" | "grid";
  dimensions: {
    rowCount: number;
    colCount: number;
    headerRowCount: number;
    dataRowCount: number;
  };
}

export function scanAndAnalyzeXlsx(sheet: XLSX.WorkSheet): AnalyzedXlsxResult {
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }) as any[][];

  if (!rawMatrix || !rawMatrix.length) {
    return {
      headers: [],
      parsed: [],
      headerStructure: {
        isMultiLevel: false,
        mainHeaders: [],
        subHeaders: [],
      },
      layoutMode: "grid",
      dimensions: {
        rowCount: 0,
        colCount: 0,
        headerRowCount: 0,
        dataRowCount: 0,
      },
    };
  }

  const rowCount = rawMatrix.length;
  const colCount = Math.max(
    ...rawMatrix.map((r) => (Array.isArray(r) ? r.length : 0)),
    0,
  );

  const merges = (sheet as any)["!merges"] || [];
  const mergeLookup: Record<string, MergedCellSpan> = {};

  merges.forEach((m: any) => {
    const rowSpan = m.e.r - m.s.r + 1;
    const colSpan = m.e.c - m.s.c + 1;
    const originKey = `${m.s.r}_${m.s.c}`;
    const value = String(rawMatrix[m.s.r]?.[m.s.c] ?? "").trim();
    mergeLookup[originKey] = { s: m.s, e: m.e, rowSpan, colSpan, value };
  });

  const rowScores = rawMatrix
    .slice(0, Math.min(40, rawMatrix.length))
    .map((row, idx) => {
      let filled = 0;
      let labelLike = 0;
      (row || []).forEach((cell) => {
        const s = String(cell ?? "").trim();
        if (s !== "") {
          filled++;
          if (
            /[a-zA-Z]/.test(s) &&
            !/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(s)
          ) {
            labelLike++;
          }
        }
      });
      return {
        index: idx,
        filled,
        labelLike,
        score: filled * 2 + labelLike * 3,
      };
    });

  const bestHeaderRow = rowScores.reduce(
    (best, curr) => (curr.score > best.score ? curr : best),
    { index: 0, filled: 0, labelLike: 0, score: -1 },
  );

  const subHeaderIndex = bestHeaderRow.index;

  const matrix = rawMatrix.map((r) => [...(r || [])]);
  merges.forEach((m: any) => {
    const topVal = String(rawMatrix[m.s.r]?.[m.s.c] ?? "").trim();
    if (!topVal) return;
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!matrix[r]) matrix[r] = [];
      for (let c = m.s.c; c <= m.e.c; c++) {
        // For subHeaderIndex and data rows, non-origin cells in horizontal merges (c > m.s.c)
        // should NOT duplicate the header label text into duplicate columns!
        if (c > m.s.c && r >= subHeaderIndex) {
          matrix[r][c] = "";
        } else {
          matrix[r][c] = topVal;
        }
      }
    }
  });

  const subRow = matrix[subHeaderIndex] || [];
  const maxCols = Math.max(subRow.length, colCount);

  const headerRowIndices: number[] = [];
  for (let r = 0; r < subHeaderIndex; r++) {
    const filledCount = (matrix[r] || []).filter(
      (v) => String(v).trim() !== "",
    ).length;
    if (filledCount < 2) continue;
    const coverage = maxCols > 0 ? filledCount / maxCols : 0;
    if (coverage >= 0.25 || filledCount >= 3) {
      headerRowIndices.push(r);
    }
  }

  const isMultiLevel = headerRowIndices.length > 0;

  const rawDataRows = matrix
    .slice(subHeaderIndex + 1)
    .filter(
      (row) =>
        Array.isArray(row) && row.some((val) => String(val).trim() !== ""),
    );

  const keepCol: boolean[] = [];
  for (let c = 0; c < maxCols; c++) {
    const rawSub = String(subRow[c] ?? "").trim();
    const isEmptyEverywhere =
      rawSub === "" &&
      rawDataRows.every((row) => String((row as any[])[c] ?? "").trim() === "");
    keepCol.push(!isEmptyEverywhere);
  }

  const keptIndices: number[] = [];
  for (let c = 0; c < maxCols; c++) {
    if (keepCol[c]) keptIndices.push(c);
  }

  const columnsInfo: { key: string; label: string }[] = [];
  const keyCounts = new Map<string, number>();

  keptIndices.forEach((c) => {
    const rawSub = String(subRow[c] ?? "").trim();
    const label = rawSub || `Column ${c + 1}`;
    const count = (keyCounts.get(label) ?? 0) + 1;
    keyCounts.set(label, count);

    const key = count === 1 ? label : `${label} (${count})`;
    columnsInfo.push({ key, label });
  });

  const headers = columnsInfo.map((c) => c.key);

  const headerLevels: HeaderLevel[] = [];

  headerRowIndices.forEach((rIdx, levelIdx) => {
    const row = matrix[rIdx] || [];
    const groups: MainHeaderGroup[] = [];
    let currentGroup: MainHeaderGroup | null = null;

    keptIndices.forEach((c, infoIdx) => {
      const title = String(row[c] ?? "").trim();
      const subCol = columnsInfo[infoIdx] || {
        key: `Col_${c + 1}`,
        label: `Col_${c + 1}`,
      };
      const mergeSpan = mergeLookup[`${rIdx}_${c}`];

      if (!currentGroup || currentGroup.title !== title) {
        currentGroup = {
          title,
          colSpan: mergeSpan
            ? Math.min(mergeSpan.colSpan, keptIndices.length - infoIdx)
            : 1,
          rowSpan: mergeSpan ? mergeSpan.rowSpan : 1,
          isMerged: !!mergeSpan,
          startCol: c,
          endCol: c,
          columns: [{ key: subCol.key, label: subCol.label }],
        };
        groups.push(currentGroup);
      } else {
        currentGroup.colSpan++;
        currentGroup.endCol = c;
        currentGroup.columns.push({ key: subCol.key, label: subCol.label });
      }
    });

    headerLevels.push({
      levelIndex: levelIdx,
      groups,
    });
  });

  const mainHeaders =
    headerLevels.length > 0
      ? headerLevels[headerLevels.length - 1].groups
      : columnsInfo.map((c) => ({
          title: c.label,
          colSpan: 1,
          columns: [{ key: c.key, label: c.label }],
        }));

  const parsed = rawDataRows.map((row) =>
    Object.fromEntries(
      headers.map((key, i) => [
        key,
        String((row as any[])[keptIndices[i]] ?? ""),
      ]),
    ),
  );

  const dataMerges: Record<string, MergedCellSpan> = {};
  merges.forEach((m: any) => {
    if (m.s.r > subHeaderIndex) {
      const dataRowIndex = m.s.r - subHeaderIndex - 1;
      const keptColIdx = keptIndices.indexOf(m.s.c);
      if (keptColIdx !== -1) {
        const rowSpan = m.e.r - m.s.r + 1;
        const colSpan = m.e.c - m.s.c + 1;
        const val = String(rawMatrix[m.s.r]?.[m.s.c] ?? "").trim();
        dataMerges[`${dataRowIndex}_${keptColIdx}`] = {
          s: { r: dataRowIndex, c: keptColIdx },
          e: { r: m.e.r - subHeaderIndex - 1, c: m.e.c - subHeaderIndex - 1 },
          rowSpan,
          colSpan,
          value: val,
        };
      }
    }
  });

  const hasCreditDebitCols = headers.some((h) =>
    /debit|credit|dr|cr|receipt|issue|inout|p\.?type/i.test(h),
  );
  const isMeltingReport = false;

  let layoutMode: "ledger" | "melting" | "grid" = "grid";
  if (isMeltingReport) {
    layoutMode = "melting";
  } else if (hasCreditDebitCols) {
    layoutMode = "ledger";
  }

  const detectedReportType = isMeltingReport
    ? "Metal Melting / In-Out Balance Report"
    : hasCreditDebitCols
      ? "Credit / Debit Financial Ledger"
      : isMultiLevel
        ? `Multi-Level Table (${headerLevels.length + 1} Header Tiers)`
        : "Standard Tabular Spreadsheet";

  const headerStructure: HeaderStructure = {
    isMultiLevel,
    levels: headerLevels,
    mainHeaders,
    subHeaders: headers,
    dimensions: {
      rowCount,
      colCount,
      headerRowCount: subHeaderIndex + 1,
      dataRowCount: parsed.length,
    },
    mergesCount: merges.length,
    layoutMode,
    hasCreditDebit: hasCreditDebitCols,
    detectedReportType,
    dataMerges,
  };

  return {
    headers,
    parsed,
    headerStructure,
    layoutMode,
    dimensions: {
      rowCount,
      colCount,
      headerRowCount: subHeaderIndex + 1,
      dataRowCount: parsed.length,
    },
  };
}

interface LedgerPaneProps {
  title: string;
  tone: "debit" | "credit";
  rows: {
    row: Record<string, string>;
    index: number;
    group: string;
  }[];
  columns: string[];
  transactionKey: string;
  typeKey: string;
  amountKey: string;
  numericKeys: string[];
  selected: number[];
  toggleApproval: (index: number) => void;
  getRelatedGroupIndices?: (index: number) => number[];
  rowGroupMeta?: Map<number, GroupedRowMeta>;
  entryColorPalette?: EntryColorPaletteKey;
}

function LedgerPane({
  title,
  tone,
  rows,
  columns,
  transactionKey,
  typeKey,
  amountKey,
  numericKeys,
  selected,
  toggleApproval,
  getRelatedGroupIndices,
  rowGroupMeta,
  entryColorPalette = "classic",
}: LedgerPaneProps) {
  const isDebit = tone === "debit";

  // Filter out internal metadata column _originalIndex
  const displayColumns = columns.filter((col) => col !== "_originalIndex");

  // Non-numeric columns render as normal table columns; numeric/amount
  // columns get their own right-aligned columns at the end.
  const textColumns = displayColumns.filter(
    (column) => column !== amountKey && !numericKeys.includes(column),
  );

  return (
    <div
      className={`min-w-[420px] flex-1 overflow-x-auto ${
        isDebit ? "bg-[#faf5f2]" : "border-r border-[#c8b3a7] bg-[#f3f8f7]"
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-4 py-2.5 ${
          isDebit
            ? "border-[#d9c2b5] bg-[#ead8ce]"
            : "border-[#b9d0cc] bg-[#dcece9]"
        }`}
      >
        <span
          className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
            isDebit ? "text-[#8f5039]" : "text-[#126c65]"
          }`}
        >
          {title}
        </span>
        <span
          className={`rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold ${
            isDebit ? "text-[#9b5d44]" : "text-[#18776e]"
          }`}
        >
          {rows.length} entries
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#123955] bg-[#18476A] text-xs font-bold uppercase tracking-wider text-white">
            <th className="w-9 px-3.5 py-2.5">Check</th>
            {textColumns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3.5 py-2.5">
                {column}
              </th>
            ))}
            {numericKeys.map((nk) => (
              <th
                key={nk}
                className="whitespace-nowrap px-3.5 py-2.5 text-right"
              >
                {nk}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, index, group }) => {
            const groupIndices = getRelatedGroupIndices
              ? getRelatedGroupIndices(index)
              : [index];
            const isFullyApproved =
              groupIndices.length > 0 &&
              groupIndices.every((idx) => selected.includes(idx));
            const isPartiallyApproved =
              !isFullyApproved &&
              groupIndices.some((idx) => selected.includes(idx));
            const isRowApproved = isFullyApproved || selected.includes(index);

            const meta = rowGroupMeta?.get(index);
            const groupId = meta?.groupId ?? index;
            const band = getEntryBandStyle(groupId, entryColorPalette);
            const user = getAuthUser();
            const currentUserName =
              user?.name || user?.email?.split("@")[0] || "BHAVESH";

            return (
              <tr
                key={`${group}-${index}`}
                className={`border-b border-black/5 transition ${
                  isRowApproved
                    ? "bg-[#d3efe6] hover:bg-[#c4ebd3]"
                    : `${band.base} ${band.hover}`
                }`}
              >
                <td
                  className={`px-3.5 py-2.5 align-top ${
                    !isRowApproved && entryColorPalette !== "none"
                      ? band.border
                      : ""
                  }`}
                >
                  <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleApproval(index)}
                      title={
                        isFullyApproved
                          ? "Approved - click to deselect"
                          : "Click to approve"
                      }
                      className={`grid h-4 w-4 place-items-center rounded border transition ${
                        isFullyApproved
                          ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                          : isPartiallyApproved
                            ? "border-emerald-500 bg-emerald-100 text-emerald-800 shadow-xs"
                            : "border-slate-400 bg-white text-transparent hover:border-slate-600"
                      }`}
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    {isRowApproved && (
                      <span className="inline-flex items-center rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap">
                        By - {currentUserName}
                      </span>
                    )}
                  </div>
                </td>
                {textColumns.map((column) => (
                  <td
                    key={column}
                    className="whitespace-nowrap px-3.5 py-2.5 align-top text-xs font-medium text-slate-700"
                  >
                    {column === transactionKey
                      ? row[column] || group || "—"
                      : row[column] || "—"}
                  </td>
                ))}
                {numericKeys.map((nk) => (
                  <td
                    key={nk}
                    className={`whitespace-nowrap px-3.5 py-2.5 text-right align-top text-xs font-bold ${
                      isDebit ? "text-[#8f5039]" : "text-[#126c65]"
                    }`}
                  >
                    {row[nk] || "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <p className="px-4 py-8 text-center text-xs text-slate-400">
          No {title.toLowerCase()} rows in this report.
        </p>
      )}
    </div>
  );
}

interface LedgerTableViewProps {
  rows: Record<string, any>[];
  columns: string[];
  transactionKey: string;
  typeKey: string;
  amountKey: string;
  selected: number[];
  toggleApproval: (index: number) => void;
  getRelatedGroupIndices?: (index: number) => number[];
  rowGroupMeta?: Map<number, GroupedRowMeta>;
  entryColorPalette?: EntryColorPaletteKey;
}

function LedgerTableView({
  rows,
  columns,
  transactionKey,
  typeKey,
  amountKey,
  selected,
  toggleApproval,
  getRelatedGroupIndices,
  rowGroupMeta,
  entryColorPalette,
}: LedgerTableViewProps) {
  // Helper numeric parser
  const parseAmt = (val: any) => {
    if (!val) return 0;
    const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? 0 : num;
  };

  const formatNum = (num: number, isWeight = false) => {
    return num.toLocaleString("en-IN", {
      minimumFractionDigits: isWeight ? 3 : 1,
      maximumFractionDigits: isWeight ? 3 : 2,
    });
  };

  const displayCols = columns.filter((c) => c !== "_originalIndex");

  // Identify all numeric keys in the rows (e.g. Gr. Wt., Net Wt., Fine, Amt, Credit, Debit)
  const numericKeys = displayCols.filter((col) => {
    if (
      /wt|weight|fine|amt|amount|price|credit|debit|total|cost|balance/i.test(
        col,
      )
    )
      return true;
    const sample = rows.slice(0, 10);
    if (!sample.length) return false;
    const numCount = sample.filter(
      (r) => !isNaN(parseFloat(String(r[col]))),
    ).length;
    return numCount > sample.length * 0.5;
  });

  const primaryNumericKeys =
    numericKeys.length > 0 ? numericKeys : [amountKey || "Amt."];

  const debitCol = displayCols.find((col) =>
    /^debit$|debit.*amt|dr\.?$/i.test(col.trim()),
  );
  const creditCol = displayCols.find((col) =>
    /^credit$|credit.*amt|cr\.?$/i.test(col.trim()),
  );
  const typeCol =
    typeKey ||
    displayCols.find((col) =>
      /type|category|nature|dr.?cr|credit.?debit|p\.?type|inout/i.test(col),
    );

  let currentGroup = "";
  const entries = rows.map((row, loopIndex) => {
    const origIndex =
      typeof row._originalIndex === "number"
        ? (row._originalIndex as number)
        : loopIndex;
    const value =
      row["Book Name"] ||
      row["BookHeadName"] ||
      row[transactionKey]?.trim() ||
      "";
    if (value && !/total/i.test(value)) currentGroup = value;
    return { row, index: origIndex, group: currentGroup };
  });

  const debit = entries.filter(({ row }) => {
    if (
      debitCol &&
      parseAmt(row[debitCol]) > 0 &&
      (!creditCol || parseAmt(row[creditCol]) === 0)
    )
      return true;
    if (
      creditCol &&
      parseAmt(row[creditCol]) === 0 &&
      debitCol &&
      parseAmt(row[debitCol]) > 0
    )
      return true;
    if (
      typeCol &&
      row[typeCol] &&
      /debit|\[01\]|receipt|receive|dr|in|plus|deposit/i.test(
        String(row[typeCol]),
      )
    )
      return true;
    if (
      row["Type"] &&
      /debit|\[01\]|receipt|receive|dr|in|plus|deposit/i.test(
        String(row["Type"]),
      )
    )
      return true;
    if (row["InOut"] && /in|receive/i.test(String(row["InOut"]))) return true;
    if (
      typeKey &&
      row[typeKey] &&
      /debit|receipt|receive|in|plus|deposit/i.test(String(row[typeKey]))
    )
      return true;
    return false;
  });

  const credit = entries.filter(({ row }) => {
    if (
      creditCol &&
      parseAmt(row[creditCol]) > 0 &&
      (!debitCol || parseAmt(row[debitCol]) === 0)
    )
      return true;
    if (
      debitCol &&
      parseAmt(row[debitCol]) === 0 &&
      creditCol &&
      parseAmt(row[creditCol]) > 0
    )
      return true;
    if (
      typeCol &&
      row[typeCol] &&
      /credit|\[02\]|issue|payment|cr|out|minus|withdraw/i.test(
        String(row[typeCol]),
      )
    )
      return true;
    if (
      row["Type"] &&
      /credit|\[02\]|issue|payment|cr|out|minus|withdraw/i.test(
        String(row["Type"]),
      )
    )
      return true;
    if (row["InOut"] && /out|issue/i.test(String(row["InOut"]))) return true;
    if (
      typeKey &&
      row[typeKey] &&
      /credit|issue|payment|cr|out|minus|withdraw/i.test(String(row[typeKey]))
    )
      return true;
    return false;
  });

  // Fallback categorization for unassigned rows
  const unassigned = entries.filter(
    (e) => !debit.includes(e) && !credit.includes(e),
  );
  if (unassigned.length > 0) {
    unassigned.forEach((e) => {
      const rowStr = JSON.stringify(e.row).toLowerCase();
      if (/debit|receipt|in|receive|deposit/i.test(rowStr)) {
        debit.push(e);
      } else if (/credit|issue|payment|out|withdraw/i.test(rowStr)) {
        credit.push(e);
      } else {
        debit.push(e);
      }
    });
  }

  const primaryKey =
    primaryNumericKeys[primaryNumericKeys.length - 1] || amountKey || "Amt.";
  const isWeight = /wt|weight|fine/i.test(primaryKey);

  let debitVerified = 0;
  let debitUnverified = 0;
  debit.forEach(({ row, index }) => {
    const amt = parseAmt(
      (debitCol && row[debitCol]) ||
        row["Debit"] ||
        row["Dr"] ||
        row[primaryKey] ||
        row["Amount"],
    );
    if (selected.includes(index)) {
      debitVerified += amt;
    } else {
      debitUnverified += amt;
    }
  });
  const debitSubTotal = debitVerified + debitUnverified;

  let creditVerified = 0;
  let creditUnverified = 0;
  credit.forEach(({ row, index }) => {
    const amt = parseAmt(
      (creditCol && row[creditCol]) ||
        row["Credit"] ||
        row["Cr"] ||
        row[primaryKey] ||
        row["Amount"],
    );
    if (selected.includes(index)) {
      creditVerified += amt;
    } else {
      creditUnverified += amt;
    }
  });
  const creditSubTotal = creditVerified + creditUnverified;
  const closingBalance = debitSubTotal - creditSubTotal;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1040px]">
        {/* Top Header Banner matching existing UI */}
        <div className="flex items-center justify-between border-b border-[#095f5a] bg-[#0e776f] px-5 py-3 text-white">
          <div>
            <p className="text-xs font-bold">Dynamic report ledger</p>
            <p className="mt-0.5 text-[10px] text-white/65">
              All uploaded entries managed in one side-by-side ledger
            </p>
          </div>
          <span className="text-[10px] font-semibold text-white/75">
            {entries.length} source rows
          </span>
        </div>

        {/* Side-by-side Ledger Panes */}
        <div className="grid grid-cols-2">
          <LedgerPane
            title="Credit report"
            tone="credit"
            rows={credit}
            columns={displayCols}
            transactionKey={transactionKey}
            typeKey={typeKey}
            amountKey={amountKey}
            numericKeys={primaryNumericKeys}
            selected={selected}
            toggleApproval={toggleApproval}
            getRelatedGroupIndices={getRelatedGroupIndices}
            rowGroupMeta={rowGroupMeta}
            entryColorPalette={entryColorPalette}
          />
          <LedgerPane
            title="Debit report"
            tone="debit"
            rows={debit}
            columns={displayCols}
            transactionKey={transactionKey}
            typeKey={typeKey}
            amountKey={amountKey}
            numericKeys={primaryNumericKeys}
            selected={selected}
            toggleApproval={toggleApproval}
            getRelatedGroupIndices={getRelatedGroupIndices}
            rowGroupMeta={rowGroupMeta}
            entryColorPalette={entryColorPalette}
          />
        </div>

        {/* Dynamic Ledger Summary Footer */}
        <div className="border-t border-[#c8b3a7] bg-white text-xs">
          {/* Row 1: Verify / Unverify / Sub Total */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7] border-b border-slate-200">
            {/* Credit Side (left) */}
            <div className="grid grid-cols-4 items-center px-2 py-2 text-slate-700">
              <div className="text-center font-medium">
                Verify :{" "}
                <span className="font-bold text-[#18476A]">
                  {formatNum(creditVerified, isWeight)}
                </span>
              </div>
              <div className="text-center font-medium">
                Unverify :{" "}
                <span className="font-bold text-[#18476A]">
                  {formatNum(creditUnverified, isWeight)}
                </span>
              </div>
              <div className="text-right font-bold text-slate-800 pr-2">
                Sub Total
              </div>
              <div className="text-right font-bold text-slate-900 pr-2">
                {formatNum(creditSubTotal, isWeight)}
              </div>
            </div>
            {/* Debit Side (right) */}
            <div className="grid grid-cols-4 items-center px-2 py-2 text-slate-700">
              <div className="text-center font-medium">
                Verify :{" "}
                <span className="font-bold text-[#18476A]">
                  {formatNum(debitVerified, isWeight)}
                </span>
              </div>
              <div className="text-center font-medium">
                Unverify :{" "}
                <span className="font-bold text-[#18476A]">
                  {formatNum(debitUnverified, isWeight)}
                </span>
              </div>
              <div className="text-right font-bold text-slate-800 pr-2">
                Sub Total
              </div>
              <div className="text-right font-bold text-slate-900 pr-2">
                {formatNum(debitSubTotal, isWeight)}
              </div>
            </div>
          </div>

          {/* Row 2: Total Issue / Total Receipt */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7] border-b border-slate-200">
            {/* Credit Side Total Issue (left) */}
            <div className="grid grid-cols-4 items-center px-2 py-2">
              <div className="col-span-3 text-right font-bold text-slate-800 pr-2">
                Total Issue
              </div>
              <div className="text-right font-bold text-slate-900 pr-2">
                {formatNum(creditSubTotal, isWeight)}
              </div>
            </div>
            {/* Debit Side Total Receipt (right) */}
            <div className="grid grid-cols-4 items-center px-2 py-2">
              <div className="col-span-3 text-right font-bold text-slate-800 pr-2">
                Total Receipt
              </div>
              <div className="text-right font-bold text-slate-900 pr-2">
                {formatNum(debitSubTotal, isWeight)}
              </div>
            </div>
          </div>

          {/* Row 3: Closing Balance */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7]">
            <div></div>
            <div className="grid grid-cols-4 items-center px-2 py-2">
              <div className="col-span-3 text-right font-bold text-slate-800 pr-2">
                Closing Balance
              </div>
              <div className="text-right font-bold text-slate-900 pr-2">
                {formatNum(closingBalance, isWeight)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DynamicReportViewer({
  query,
  setQuery,
  permissions = {
    view: true,
    add: true,
    update: true,
    delete: true,
    export: true,
  },
}: {
  query: string;
  setQuery?: (value: string) => void;
  permissions?: PermissionActions;
}) {
  type ReportRow = Record<string, any>;

  // ── References & Data States ────────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);

  const [savedReports, setSavedReports] = useState<ReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string>("");

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reportId, setReportId] = useState("");
  const [activeReportMeta, setActiveReportMeta] = useState<ReportItem | null>(
    null,
  );
  const [activeHeaderStructure, setActiveHeaderStructure] =
    useState<HeaderStructure | null>(null);
  const [activeReportHeaders, setActiveReportHeaders] = useState<string[]>([]);

  const [viewMode, setViewMode] = useState<
    "auto" | "ledger" | "grid" | "analytics"
  >("auto");
  const [entryColorPalette, setEntryColorPalette] =
    useState<EntryColorPaletteKey>("classic");
  const [headerLayoutMode, setHeaderLayoutMode] = useState<
    "melting" | "standard"
  >("melting");

  // Dynamic Database Filters State
  const [filterOptions, setFilterOptions] = useState<{
    types: string[];
    owners: string[];
    statuses: string[];
  }>({ types: [], owners: [], statuses: [] });
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  // Date range filter states (defaults to current date)
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState<string>(getTodayDateString());
  const [endDate, setEndDate] = useState<string>(getTodayDateString());

  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState("");

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  };

  // ── Fetch dynamic filter options from backend database (date-wise) ─────────────
  const loadFilterOptions = async (sDate?: string, eDate?: string) => {
    try {
      const s = sDate !== undefined ? sDate : startDate;
      const e = eDate !== undefined ? eDate : endDate;
      const params = new URLSearchParams();
      if (s) params.append("startDate", s);
      if (e) params.append("endDate", e);
      const queryParams = params.toString() ? `?${params.toString()}` : "";

      const res = await authFetch(`/api/reports/filters/options${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setFilterOptions(data.data);
        }
      }
    } catch (err) {
      console.warn("Failed to load dynamic filter options:", err);
    }
  };

  useEffect(() => {
    loadFilterOptions(startDate, endDate);
  }, [startDate, endDate]);

  // Derived list of report types available for the selected date range
  const availableReportTypes = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(savedReports)) {
      savedReports.forEach((r) => {
        if (r.name && r.name.trim()) set.add(r.name.trim());
        if (r.type && r.type.trim()) set.add(r.type.trim());
      });
    }
    if (filterOptions.types && filterOptions.types.length > 0) {
      filterOptions.types.forEach((t) => {
        if (t && t.trim()) set.add(t.trim());
      });
    }
    return Array.from(set).sort();
  }, [savedReports, filterOptions.types]);

  // ── Fetch saved reports dynamically from database with filters ──────────────
  const loadSavedReports = async (
    sDate?: string,
    eDate?: string,
    typeVal?: string,
    ownerVal?: string,
    statusVal?: string,
    searchVal?: string,
  ) => {
    setLoadingReports(true);
    try {
      const s = sDate !== undefined ? sDate : startDate;
      const e = eDate !== undefined ? eDate : endDate;
      const t = typeVal !== undefined ? typeVal : selectedType;
      const o = ownerVal !== undefined ? ownerVal : selectedOwner;
      const st = statusVal !== undefined ? statusVal : selectedStatus;
      const q = searchVal !== undefined ? searchVal : query;

      const params = new URLSearchParams();
      if (s) params.append("startDate", s);
      if (e) params.append("endDate", e);
      if (t) params.append("type", t);
      if (o) params.append("owner", o);
      if (st) params.append("status", st);
      if (q && q.trim()) params.append("search", q.trim());

      const queryParams = params.toString() ? `?${params.toString()}` : "";

      const res = await authFetch(`/api/reports${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setSavedReports(data.data);
          if (data.data.length > 0) {
            const exists = data.data.some(
              (r: ReportItem) => (r._id || r.reportId) === selectedReportId,
            );
            if (!exists || !selectedReportId) {
              selectReport(data.data[0]);
            }
          } else {
            // No reports found for selected filter parameters
            setRows([]);
            setFileName("");
            setSelectedReportId("");
            setActiveReportMeta(null);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load reports:", err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    loadSavedReports(
      startDate,
      endDate,
      selectedType,
      selectedOwner,
      selectedStatus,
      query,
    );
  }, [startDate, endDate, selectedType, selectedOwner, selectedStatus, query]);

  // ── Load selected report details ───────────────────────────────────────────
  const selectReport = async (report: ReportItem) => {
    const id = report._id || report.reportId || "";
    setSelectedReportId(id);
    setReportId(report.reportId || id);
    setFileName(report.name);
    setActiveReportMeta(report);
    setActiveHeaderStructure((report as any).headerStructure || null);
    // Restore this report's original saved column order/set
    if (Array.isArray(report.headers) && report.headers.length > 0) {
      setActiveReportHeaders(report.headers);
    } else {
      setActiveReportHeaders([]);
    }
    setSelected([]);
    setViewMode("auto");

    if (report.data && Array.isArray(report.data) && report.data.length > 0) {
      const sanitized = report.data.map((row, idx) => ({
        ...Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, String(v ?? "")]),
        ),
        _originalIndex: idx,
      }));
      const detectedCols = Array.from<string>(
        new Set(
          sanitized.flatMap((r) =>
            Object.keys(r).filter((k) => k !== "_originalIndex"),
          ),
        ),
      );
      const filled = fillSubEntriesFromMain(sanitized, detectedCols);
      const processedRows = splitMergedEntries(filled, detectedCols);
      setRows(processedRows);

      const preSelected: number[] = [];
      if (
        (report as any).approvals &&
        Array.isArray((report as any).approvals)
      ) {
        (report as any).approvals.forEach((app: any) => {
          if (typeof app.rowIndex === "number") {
            preSelected.push(app.rowIndex);
          }
        });
      }
      processedRows.forEach((row, idx) => {
        const statusVal = String(
          row["Status"] ||
            row["Check"] ||
            row["Checked"] ||
            row["P.Type"] ||
            "",
        ).toLowerCase();
        if (
          statusVal.includes("checked") ||
          statusVal.includes("✔") ||
          statusVal === "true" ||
          statusVal === "1"
        ) {
          if (!preSelected.includes(idx)) preSelected.push(idx);
        }
      });
      setSelected(preSelected);
    } else {
      try {
        const res = await authFetch(`/api/reports/${id}`);
        if (res.ok) {
          const resData = await res.json();
          if (
            resData.success &&
            resData.data &&
            Array.isArray(resData.data.data)
          ) {
            const sanitized = resData.data.data.map(
              (row: Record<string, unknown>, idx: number) => ({
                ...Object.fromEntries(
                  Object.entries(row).map(([k, v]) => [k, String(v ?? "")]),
                ),
                _originalIndex: idx,
              }),
            );
            const detectedCols = Array.from<string>(
              new Set(
                sanitized.flatMap((r: Record<string, any>) =>
                  Object.keys(r).filter((k) => k !== "_originalIndex"),
                ),
              ),
            );
            const filled = fillSubEntriesFromMain(sanitized, detectedCols);
            const processedRows = splitMergedEntries(filled, detectedCols);
            setRows(processedRows);

            const preSelected: number[] = [];
            const fetchedReport = resData.data;
            if (fetchedReport.headerStructure) {
              setActiveHeaderStructure(fetchedReport.headerStructure);
            }
            // Restore the original column order saved at upload time
            if (
              Array.isArray(fetchedReport.headers) &&
              fetchedReport.headers.length > 0
            ) {
              setActiveReportHeaders(fetchedReport.headers);
            }
            if (
              fetchedReport.approvals &&
              Array.isArray(fetchedReport.approvals)
            ) {
              fetchedReport.approvals.forEach((app: any) => {
                if (typeof app.rowIndex === "number") {
                  preSelected.push(app.rowIndex);
                }
              });
            }
            processedRows.forEach(
              (row: Record<string, string>, idx: number) => {
                const statusVal = String(
                  row["Status"] ||
                    row["Check"] ||
                    row["Checked"] ||
                    row["P.Type"] ||
                    "",
                ).toLowerCase();
                if (
                  statusVal.includes("checked") ||
                  statusVal.includes("✔") ||
                  statusVal === "true" ||
                  statusVal === "1"
                ) {
                  if (!preSelected.includes(idx)) preSelected.push(idx);
                }
              },
            );
            setSelected(preSelected);
          } else {
            setRows([]);
          }
        }
      } catch {
        setRows([]);
      }
    }
    toast(`Loaded report "${report.name}"`);
  };

  // ── Parse & Apply Spreadsheet Upload ────────────────────────────────────────
  const parseWorkbook = (buffer: ArrayBuffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return {
        headers: [],
        parsed: [],
        headerStructure: {
          isMultiLevel: false,
          mainHeaders: [],
          subHeaders: [],
        },
        layoutMode: "grid",
        dimensions: {
          rowCount: 0,
          colCount: 0,
          headerRowCount: 0,
          dataRowCount: 0,
        },
      };
    }

    return scanAndAnalyzeXlsx(sheet);
  };

  const applyWorkbook = async (buffer: ArrayBuffer, name: string) => {
    const { headers, parsed, headerStructure } = parseWorkbook(buffer);
    if (!headers.length || !parsed.length) {
      toast("No tabular data found in the first sheet");
      return;
    }

    setActiveHeaderStructure(headerStructure);
    const cleanName = name.replace(/\.[^/.]+$/, "");
    const sanitized = parsed.map((row, idx) => ({
      ...row,
      _originalIndex: idx,
    }));
    const filled = fillSubEntriesFromMain(sanitized, headers);
    const processedRows = splitMergedEntries(filled, headers);
    const isMelting = cleanName.toLowerCase().includes("melting");

    if (isMelting) {
      processedRows.forEach((row) => {
        row["Purity"] = calculateRowPurity(
          row,
          headers,
          undefined,
          processedRows,
        );
      });
    }

    setRows(processedRows);
    setFileName(cleanName);
    setSelectedReportId("new_upload");
    // Save original column order for this freshly uploaded report
    setActiveReportHeaders(headers);
    setViewMode("auto");
    const uploadDate = getTodayDateString();
    setStartDate(uploadDate);
    setEndDate(uploadDate);

    const preSelected: number[] = [];
    processedRows.forEach((row, idx) => {
      const statusVal = String(
        row["Status"] || row["Check"] || row["Checked"] || row["P.Type"] || "",
      ).toLowerCase();
      if (
        statusVal.includes("checked") ||
        statusVal.includes("✔") ||
        statusVal === "true" ||
        statusVal === "1"
      ) {
        preSelected.push(idx);
      }
    });
    setSelected(preSelected);

    let backendMsg = `${parsed.length} rows and ${headers.length} columns detected`;
    if (parsed.length > 500) {
      backendMsg = `${parsed.length} rows detected — only the first 500 are saved to the server (local view shows all)`;
    }

    // Clean filled data to save to backend (without internal metadata _originalIndex)
    const cleanBackendData = processedRows.slice(0, 500).map((r) => {
      const copy = { ...r };
      delete copy._originalIndex;
      if (isMelting && !copy["Purity"]) {
        copy["Purity"] = calculateRowPurity(
          r,
          headers,
          undefined,
          processedRows,
        );
      }
      return copy;
    });

    const backendHeaders =
      isMelting && !headers.some((c) => /purity/i.test(c))
        ? [...headers.filter((c) => !/purity/i.test(c)), "Purity"]
        : headers;

    let backendHeaderStructure = headerStructure;
    if (isMelting && headerStructure) {
      const updatedSubHeaders = headerStructure.subHeaders.some((c) =>
        /purity/i.test(c),
      )
        ? headerStructure.subHeaders
        : [
            ...headerStructure.subHeaders.filter((c) => !/purity/i.test(c)),
            "Purity",
          ];

      // NOTE: mainHeaders/levels are intentionally left untouched here.
      // Purity is a standalone trailing column, not part of the [B] In /
      // [C] Out grouping — the grid header renderer adds it as its own
      // separate cell (beside the group headers) based on gridDisplayColumns,
      // so we must not fold it into the last group's colSpan or it will
      // render as if it belongs inside "[C] Out".
      backendHeaderStructure = {
        ...headerStructure,
        subHeaders: updatedSubHeaders,
      };
    }
    setActiveHeaderStructure(backendHeaderStructure);

    try {
      const currentUser = getAuthUser();
      const res = await authFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          type: cleanName,
          source: "Spreadsheet Upload",
          owner: currentUser?.name || currentUser?.email || "Unknown",
          data: cleanBackendData,
          headers: backendHeaders,
          headerStructure: backendHeaderStructure,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setReportId(data.data.reportId || data.data._id || "");
        setActiveReportMeta(data.data);
        if (parsed.length <= 500) {
          backendMsg = `Report "${cleanName}" uploaded and saved to backend!`;
        }
        loadSavedReports();
      } else {
        backendMsg = `Parsed locally, but saving to backend failed${
          data?.error ? `: ${data.error}` : ""
        }`;
      }
    } catch {
      backendMsg = `Parsed locally, but saving to backend failed — check your connection and re-upload`;
    }

    toast(backendMsg);
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    await applyWorkbook(await file.arrayBuffer(), file.name);
    // Reset the input value so re-selecting the same file fires onChange again
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Column & Key Detections ──────────────────────────────────────────────────
  // Priority 1: use the headers saved at upload time (preserves original order
  // and column set specific to each report type).
  // Priority 2: fall back to deriving from row keys (for legacy / direct uploads).
  const columns = useMemo(() => {
    if (!rows.length) return [];

    // Derive the full column set from row keys as a reference/fallback
    const rowDerivedCols = Array.from(
      new Set(
        rows.flatMap((row) =>
          Object.keys(row).filter((k) => k !== "_originalIndex"),
        ),
      ),
    ).filter((col) =>
      rows.some((row) => {
        const val = row[col];
        return val !== null && val !== undefined && String(val).trim() !== "";
      }),
    );

    // If this report has saved headers (its own column list from upload),
    // use them — but only keep the ones that actually appear in the row data.
    if (activeReportHeaders.length > 0) {
      const rowColSet = new Set(rowDerivedCols);
      const fromSaved = activeReportHeaders.filter(
        (h) => h !== "_originalIndex" && rowColSet.has(h),
      );
      // Append any extra columns present in rows but missing from saved headers
      // (e.g. a computed "Purity" column added after upload)
      const savedSet = new Set(fromSaved);
      const extras = rowDerivedCols.filter((c) => !savedSet.has(c));
      return extras.length > 0 ? [...fromSaved, ...extras] : fromSaved;
    }

    return rowDerivedCols;
  }, [rows, activeReportHeaders]);

  const transactionKey = useMemo(
    () =>
      columns.find((column) =>
        /transaction|voucher|entry|reference|document|journal|vou\.?no/i.test(
          column,
        ),
      ) ||
      columns[0] ||
      "Vou.No",
    [columns],
  );

  const typeKey = useMemo(
    () =>
      columns.find((column) =>
        /type|category|nature|dr.?cr|credit.?debit|p\.?type|inout/i.test(
          column,
        ),
      ) || "P.Type",
    [columns],
  );

  const amountKey = useMemo(
    () =>
      columns.find((column) =>
        /amount|amt|total|value|balance|price|cost|credit|debit|net weight|pure weight/i.test(
          column,
        ),
      ) || "Amt.",
    [columns],
  );

  // ── Melting Report Multi-Level Header & Purity Calculations ────────────────
  const MEASURE_COL_REGEX =
    /pieces|weight|wt|fine|amt|amount|price|credit|debit|piece|pcs|qty|quantity/i;

  const isMelting = useMemo(() => {
    const nameStr = (fileName || "").toLowerCase();
    const metaName = (activeReportMeta?.name || "").toLowerCase();
    const metaType = (activeReportMeta?.type || "").toLowerCase();

    return (
      nameStr.includes("melting") ||
      metaName.includes("melting") ||
      metaType.includes("melting")
    );
  }, [fileName, activeReportMeta]);

  const gridDisplayColumns = useMemo(() => {
    if (!columns.length) return [];

    if (!isMelting) {
      // Purity is ONLY for Melting Reports — strictly filter out any "Purity" column
      return columns.filter((c) => !/purity/i.test(c));
    }

    const nonPurityCols = columns.filter((c) => !/purity/i.test(c));

    let splitIndex = -1;
    const lastLevelGroups =
      (activeHeaderStructure?.levels?.length
        ? activeHeaderStructure.levels[activeHeaderStructure.levels.length - 1]
            .groups
        : activeHeaderStructure?.mainHeaders) || [];
    if (lastLevelGroups.length) {
      const inGroup = lastLevelGroups.find((g) => /\bin\b/i.test(g.title));
      const outGroupIdx = lastLevelGroups.findIndex((g) =>
        /\bout\b/i.test(g.title),
      );
      const inGroupIdx = lastLevelGroups.findIndex((g) => g === inGroup);
      if (inGroup && outGroupIdx !== -1 && outGroupIdx > inGroupIdx) {
        const lastInKey = inGroup.columns[inGroup.columns.length - 1]?.key;
        const idx = nonPurityCols.indexOf(lastInKey);
        if (idx !== -1) splitIndex = idx + 1;
      }
    }

    if (splitIndex === -1) {
      const dupIdx = nonPurityCols.findIndex((c) => /\(\d+\)$/.test(c));
      if (dupIdx > 0) splitIndex = dupIdx;
    }

    if (splitIndex === -1 || splitIndex >= nonPurityCols.length) {
      return [...nonPurityCols, "Purity"];
    }
    return [
      ...nonPurityCols.slice(0, splitIndex),
      "Purity",
      ...nonPurityCols.slice(splitIndex),
    ];
  }, [columns, isMelting, activeHeaderStructure]);

  const meltingColumns = useMemo(() => {
    return gridDisplayColumns;
  }, [gridDisplayColumns]);

  const purityColIndex = useMemo(
    () => meltingColumns.indexOf("Purity"),
    [meltingColumns],
  );

  const baseColsCount = useMemo(() => {
    let count = 0;
    for (const c of meltingColumns) {
      if (MEASURE_COL_REGEX.test(c)) break;
      count++;
    }
    return Math.max(1, count || 1);
  }, [meltingColumns]);

  const measureCols = useMemo(() => {
    return meltingColumns.filter((c) => MEASURE_COL_REGEX.test(c));
  }, [meltingColumns]);

  // With Purity positioned between IN and OUT, count each side's measure
  // columns directly from its actual position rather than splitting the
  // total in half — the two sides aren't always equal in length (e.g. IN
  // has 3 fields, OUT has 3, or IN has 4 and OUT has 3).
  const inSpanCount = useMemo(() => {
    if (purityColIndex === -1) {
      return Math.max(1, Math.floor(measureCols.length / 2) || 3);
    }
    let count = 0;
    for (let i = 0; i < purityColIndex; i++) {
      if (MEASURE_COL_REGEX.test(meltingColumns[i])) count++;
    }
    return Math.max(1, count || 3);
  }, [meltingColumns, purityColIndex, measureCols]);

  const outSpanCount = useMemo(() => {
    if (purityColIndex === -1) {
      return Math.max(1, measureCols.length - inSpanCount || 3);
    }
    let count = 0;
    for (let i = purityColIndex + 1; i < meltingColumns.length; i++) {
      if (MEASURE_COL_REGEX.test(meltingColumns[i])) count++;
      else break;
    }
    return Math.max(1, count || 3);
  }, [meltingColumns, purityColIndex]);

  const trailingColsCount = useMemo(() => {
    const covered =
      baseColsCount +
      inSpanCount +
      (purityColIndex !== -1 ? 1 : 0) +
      outSpanCount;
    return Math.max(0, meltingColumns.length - covered);
  }, [
    meltingColumns,
    baseColsCount,
    inSpanCount,
    outSpanCount,
    purityColIndex,
  ]);

  // Only a genuine "Type" style column (e.g. "Type", "P.Type", "Dr/Cr") whose
  // VALUES mark a row as a debit or credit entry qualifies a report for the
  // Credit/Debit ledger table. A report that simply has separate "Credit" and
  // "Debit" AMOUNT columns side-by-side on one row (e.g. Tools Purchase) is
  // NOT an entry-level ledger — it belongs in the plain Grid table instead.
  const explicitEntryTypeColumn = useMemo(
    () =>
      columns.find((column) =>
        /^type$|^p\.?type$|^dr\.?\/?cr$|category|nature|inout/i.test(
          column.trim(),
        ),
      ) || null,
    [columns],
  );

  const hasCreditDebitEntries = useMemo(() => {
    if (!rows.length || !explicitEntryTypeColumn) return false;
    return rows.some((row) => {
      const typeVal = String(row[explicitEntryTypeColumn] ?? "")
        .trim()
        .toLowerCase();
      if (!typeVal) return false;
      return /credit|debit|\bcr\b|\bdr\b|receipt|payment|issue|receive|\[01\]|\[02\]/.test(
        typeVal,
      );
    });
  }, [rows, explicitEntryTypeColumn]);

  const effectiveViewMode =
    viewMode === "auto"
      ? hasCreditDebitEntries
        ? "ledger"
        : "grid"
      : viewMode;

  // ── Entry grouping (background bands, subtotal rows, grand total) ──────────
  // Detected once from the full dataset (not the filtered/search subset) so
  // bands stay stable while the user types in the search box.
  const groupKeyColumn = useMemo(
    () => detectGroupKeyColumn(rows, columns),
    [rows, columns],
  );

  const rowGroupMeta = useMemo(
    () => computeRowGroups(rows, columns, groupKeyColumn),
    [rows, columns, groupKeyColumn],
  );

  const numericColumnsForTotals = useMemo(
    () => detectNumericColumns(rows, columns),
    [rows, columns],
  );

  // ── Filtering Logic ────────────────────────────────────────────────────────
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        // Global search query
        if (query.trim()) {
          const q = query.toLowerCase();
          const matchesQuery = Object.entries(row).some(([k, val]) => {
            if (k === "_originalIndex") return false;
            return String(val).toLowerCase().includes(q);
          });
          if (!matchesQuery) return false;
        }
        return true;
      }),
    [rows, query],
  );

  // Grid view should show only the actual entry rows — excluding subtotal/total rows from source data
  const visibleGridRows = useMemo(
    () =>
      filteredRows.filter((row, index) => {
        const origIndex =
          typeof row._originalIndex === "number" ? row._originalIndex : index;
        if (rowGroupMeta.get(origIndex)?.isTotalRow) return false;

        const isGrandTotalRow = columns.some((col) => {
          const val = String(row[col] ?? "")
            .trim()
            .toLowerCase();
          return (
            val === "grand total" ||
            val === "total" ||
            val.startsWith("grand total") ||
            val.endsWith("total")
          );
        });
        return !isGrandTotalRow;
      }),
    [filteredRows, rowGroupMeta, columns],
  );

  // Computed Grand Totals calculated dynamically directly from visibleGridRows
  const grandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericColumnsForTotals.forEach((col) => (totals[col] = 0));

    visibleGridRows.forEach((row) => {
      numericColumnsForTotals.forEach((col) => {
        const n = parseNumeric(row[col]);
        if (n !== null) {
          totals[col] += n;
        }
      });
    });

    return totals;
  }, [visibleGridRows, numericColumnsForTotals]);

  const grandTotalPurity = useMemo(() => {
    return calculateOverallPurity(visibleGridRows, columns);
  }, [visibleGridRows, columns]);

  // ── Handlers & Actions ─────────────────────────────────────────────────────
  const getRelatedGroupIndices = (targetIndex: number): number[] => {
    const targetGroupId = rowGroupMeta.get(targetIndex)?.groupId;

    if (targetGroupId !== undefined && targetGroupId !== -1) {
      const groupIndices: number[] = [];
      rows.forEach((r, i) => {
        const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
        if (rowGroupMeta.get(idx)?.groupId === targetGroupId) {
          groupIndices.push(idx);
        }
      });
      if (groupIndices.length > 0) {
        return groupIndices;
      }
    }

    const targetRow =
      rows.find(
        (r, i) =>
          (typeof r._originalIndex === "number" ? r._originalIndex : i) ===
          targetIndex,
      ) || rows[targetIndex];

    if (!targetRow) return [targetIndex];

    const transVal = transactionKey
      ? String(targetRow[transactionKey] ?? "").trim()
      : "";
    if (transVal !== "" && transVal !== "—") {
      const matchedIndices: number[] = [];
      rows.forEach((r, i) => {
        const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
        if (String(r[transactionKey] ?? "").trim() === transVal) {
          matchedIndices.push(idx);
        }
      });
      if (matchedIndices.length > 0) return matchedIndices;
    }

    return [targetIndex];
  };

  const toggleApproval = (index: number) => {
    const groupIndices = getRelatedGroupIndices(index);
    setSelected((current) => {
      const allSelected = groupIndices.every((idx) => current.includes(idx));
      if (allSelected) {
        return current.filter((idx) => !groupIndices.includes(idx));
      }
      return Array.from(new Set([...current, ...groupIndices]));
    });
  };

  const toggleSelectAll = () => {
    const filteredIndices = visibleGridRows.map((r, i) =>
      typeof r._originalIndex === "number" ? r._originalIndex : i,
    );
    const allFilteredSelected = filteredIndices.every((idx) =>
      selected.includes(idx),
    );

    if (allFilteredSelected && filteredIndices.length > 0) {
      setSelected((prev) =>
        prev.filter((idx) => !filteredIndices.includes(idx)),
      );
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...filteredIndices])));
    }
  };

  const saveApprovalsToBackend = async () => {
    if (!selected.length) {
      toast("Select at least one row to approve");
      return;
    }

    const activeId = reportId || selectedReportId || "REP-CURRENT";
    let backendMsg = `${selected.length} row(s) saved with approval audit trail`;
    const currentUser = getAuthUser();
    try {
      const res = await authFetch(`/api/reports/${activeId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedIndexes: selected,
          approvedBy: currentUser?.name || currentUser?.email || "Unknown",
        }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        backendMsg = data.message;
        loadSavedReports();
      } else if (data.error) {
        backendMsg = data.error;
      }
    } catch {
      backendMsg =
        "Failed to save approvals — check your connection and try again";
    }

    toast(backendMsg);
  };

  const exportFilteredRowsToXlsx = () => {
    if (filteredRows.length === 0) {
      toast("No data available to export");
      return;
    }
    const exportCols = gridDisplayColumns;
    const sanitizedExportData = filteredRows.map((r) => {
      const copy: Record<string, any> = {};
      exportCols.forEach((col) => {
        if (/purity/i.test(col)) {
          copy[col] = r[col] || calculateRowPurity(r, columns, undefined, rows);
        } else {
          copy[col] = r[col] ?? "";
        }
      });
      return copy;
    });
    const worksheet = XLSX.utils.json_to_sheet(sanitizedExportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Filtered Report Data");

    const cleanBase = (fileName || "report").toLowerCase().replace(/\s+/g, "-");
    const outputFileName = `${cleanBase}-filtered.xlsx`;
    XLSX.writeFile(workbook, outputFileName);
    toast(`Exported ${filteredRows.length} rows to XLSX`);

    authFetch("/api/audit-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        module: "Reports",
        section: `Report ${fileName}`,
        action: "Export XLSX",
        details: `Exported ${filteredRows.length} records from report "${fileName}" to XLSX`,
      }),
    }).catch(() => {});
  };

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span>Main menu</span>
            <ChevronRight size={12} />
            <span className="text-slate-600">Reports</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950 flex items-center gap-2.5">
            Reports
          </h1>
        </div>

        {/* Upload & Actions */}
        {permissions.add && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => handleUpload(event.target.files?.[0])}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-xs font-semibold text-white shadow-lg shadow-[#18476A]/20 transition hover:bg-[#123955]"
            >
              <Upload size={15} />
              Upload spreadsheet
            </button>
          </div>
        )}
      </div>

      {/* ── Toast Notification Banner ── */}
      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#18476A] px-4 py-3 text-xs font-semibold text-white shadow-md animate-in fade-in slide-in-from-top-1">
          <Sparkles size={16} className="text-amber-300" />
          <span>{notice}</span>
        </div>
      )}

      {/* ── Main Data Viewer Container ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xl">
        {/* Controls Toolbar */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {fileName ? fileName : "Report Viewer"}
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Dynamic Date-wise Report Type Filter Dropdown */}
            {availableReportTypes.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/90 px-2.5 py-1">
                <Filter size={12} className="text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Report Type:
                </span>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedType(val);
                    if (val) {
                      const rep = savedReports.find(
                        (r) =>
                          r.name === val ||
                          r.type === val ||
                          (r._id || r.reportId) === val,
                      );
                      if (rep) selectReport(rep);
                    }
                  }}
                  className="h-7 max-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#8fc3e0]"
                >
                  <option value="">
                    All Types ({availableReportTypes.length})
                  </option>
                  {availableReportTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
              <div className="flex items-center gap-1 px-1.5 text-xs text-slate-500 font-medium">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  FROM
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-[#8fc3e0]"
                  title="From Date"
                />
              </div>
              <div className="flex items-center gap-1 px-1.5 text-xs text-slate-500 font-medium">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  TO
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-700 outline-none focus:border-[#8fc3e0]"
                  title="To Date"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  title="Clear Date Range Filter"
                  className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Export XLSX Button */}
            {permissions.export && (
              <button
                onClick={exportFilteredRowsToXlsx}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition shadow-xs"
                title="Export filtered data to Excel XLSX"
              >
                <FileSpreadsheet size={14} className="text-emerald-700" />
                Export XLSX
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => {
                if (activeReportMeta) {
                  selectReport(activeReportMeta);
                } else {
                  loadSavedReports();
                }
              }}
              title="Refresh report data"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition shadow-xs"
            >
              <RefreshCw
                size={14}
                className={loadingReports ? "animate-spin text-[#18476A]" : ""}
              />
            </button>
          </div>
        </div>

        {/* ── Active View Rendering ── */}
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3.5 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100/80 text-slate-400">
              <FileSpreadsheet size={28} />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {fileName
                ? `No data available in "${fileName}"`
                : "No report dataset selected"}
            </h3>
            <p className="mx-auto mt-1.5 mb-5 max-w-sm text-xs text-slate-500">
              Select a report from the dropdown above or upload a spreadsheet
              file to view report data.
            </p>
            {permissions.add && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-5 text-xs font-semibold text-white shadow-md shadow-[#18476A]/20 hover:bg-[#123955] transition"
              >
                <Upload size={15} />
                Upload spreadsheet file
              </button>
            )}
          </div>
        ) : (
          <>
            {/* 1. Side-by-Side Financial Ledger View */}
            {effectiveViewMode === "ledger" && (
              <LedgerTableView
                rows={filteredRows}
                columns={columns}
                transactionKey={transactionKey!}
                typeKey={typeKey!}
                amountKey={amountKey!}
                selected={selected}
                toggleApproval={toggleApproval}
                getRelatedGroupIndices={getRelatedGroupIndices}
                rowGroupMeta={rowGroupMeta}
                entryColorPalette={entryColorPalette}
              />
            )}

            {/* 2. Standard Tabular Grid View */}
            {effectiveViewMode === "grid" && (
              <div className="max-h-[750px] xl:max-h-[calc(100vh-230px)] overflow-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
                  {activeHeaderStructure &&
                  activeHeaderStructure.isMultiLevel &&
                  ((activeHeaderStructure.levels &&
                    activeHeaderStructure.levels.length > 0) ||
                    activeHeaderStructure.mainHeaders.length > 0) ? (
                    <thead className="sticky top-0 z-20 bg-[#18476A] font-sans text-xs border-b border-white/40 shadow-sm">
                      {activeHeaderStructure.levels &&
                      activeHeaderStructure.levels.length > 0 ? (
                        <>
                          {activeHeaderStructure.levels.map((lvl, lIdx) => {
                            const displayGroups = buildDisplayHeaderGroups(
                              lvl.groups,
                              gridDisplayColumns,
                            );

                            return (
                              <tr
                                key={lIdx}
                                className="bg-[#18476A] text-white font-bold text-xs uppercase tracking-wider border-b border-white/20"
                              >
                                {lIdx === 0 && (
                                  <th
                                    rowSpan={
                                      activeHeaderStructure.levels!.length + 1
                                    }
                                    className="sticky left-0 z-30 bg-[#18476A] px-4 py-2.5 border-r border-b border-white/40 whitespace-nowrap min-w-[95px] align-middle text-center"
                                  >
                                    <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={toggleSelectAll}
                                        className={`grid h-4 w-4 place-items-center rounded border transition ${
                                          selected.length ===
                                            visibleGridRows.length &&
                                          visibleGridRows.length > 0
                                            ? "border-emerald-400 bg-emerald-500 text-white"
                                            : "border-white/40 bg-white/10 text-transparent hover:border-white/70"
                                        }`}
                                        title="Toggle Select All"
                                      >
                                        <Check size={11} strokeWidth={3} />
                                      </button>
                                      <span className="text-white font-bold text-xs whitespace-nowrap">
                                        APPROVE
                                      </span>
                                    </div>
                                  </th>
                                )}
                                {displayGroups.map((grp, gIdx) => (
                                  <th
                                    key={gIdx}
                                    colSpan={grp.colSpan}
                                    rowSpan={grp.rowSpan || 1}
                                    className="px-3.5 py-2 font-bold text-white text-center border-r border-b border-white/40 bg-[#18476A] uppercase tracking-wider text-xs whitespace-nowrap align-middle"
                                  >
                                    {grp.title}
                                  </th>
                                ))}
                              </tr>
                            );
                          })}

                          {/* Header Row: Sub Header Labels */}
                          <tr className="bg-[#18476A] text-white font-bold text-xs">
                            {gridDisplayColumns.map((colKey, idx) => {
                              const displayLabel = colKey.replace(
                                /\s*\(\d+\)$/,
                                "",
                              );
                              const isNum =
                                /pieces|weight|wt|fine|amt|amount|price|credit|debit|purity/i.test(
                                  colKey,
                                );
                              return (
                                <th
                                  key={idx}
                                  className={`px-3.5 py-2.5 border-r border-b border-white/40 font-bold text-white whitespace-nowrap text-xs align-middle ${
                                    isNum ? "text-right" : "text-left"
                                  }`}
                                >
                                  {displayLabel}
                                </th>
                              );
                            })}
                          </tr>
                        </>
                      ) : (
                        <tr className="bg-[#18476A] text-white font-bold text-xs uppercase tracking-wider">
                          <th className="sticky left-0 bg-[#18476A] px-4 py-2 border-r border-b border-white/40 whitespace-nowrap min-w-[95px] align-middle">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={toggleSelectAll}
                                className={`grid h-4 w-4 place-items-center rounded border transition ${
                                  selected.length === visibleGridRows.length &&
                                  visibleGridRows.length > 0
                                    ? "border-emerald-400 bg-emerald-500 text-white"
                                    : "border-white/40 bg-white/10 text-transparent hover:border-white/70"
                                }`}
                                title="Toggle Select All"
                              >
                                <Check size={11} strokeWidth={3} />
                              </button>
                              <span className="text-white font-bold text-xs whitespace-nowrap">
                                APPROVE
                              </span>
                            </div>
                          </th>
                          {(() => {
                            const displayGroups = buildDisplayHeaderGroups(
                              activeHeaderStructure.mainHeaders,
                              gridDisplayColumns,
                            );
                            return (
                              <>
                                {displayGroups.map((grp, idx) => (
                                  <th
                                    key={idx}
                                    colSpan={grp.colSpan}
                                    className="px-3.5 py-2 font-bold text-white text-center border-r border-b border-white/40 bg-[#18476A] uppercase tracking-wider text-xs whitespace-nowrap align-middle"
                                  >
                                    {grp.title}
                                  </th>
                                ))}
                              </>
                            );
                          })()}
                        </tr>
                      )}
                    </thead>
                  ) : headerLayoutMode === "melting" ? (
                    <thead className="sticky top-0 z-20 bg-[#18476A] font-sans text-xs border-b border-white/40 shadow-sm">
                      {/* Header Row 1: [B] IN | [C] OUT Grouping */}
                      <tr className="bg-[#18476A] text-white font-bold text-xs uppercase tracking-wider">
                        <th className="sticky left-0 bg-[#18476A] px-4 py-2 border-r border-b border-white/40 whitespace-nowrap min-w-[95px] align-middle">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={toggleSelectAll}
                              className={`grid h-4 w-4 place-items-center rounded border transition ${
                                selected.length === visibleGridRows.length &&
                                visibleGridRows.length > 0
                                  ? "border-emerald-400 bg-emerald-500 text-white"
                                  : "border-white/40 bg-white/10 text-transparent hover:border-white/70"
                              }`}
                              title="Toggle Select All"
                            >
                              <Check size={11} strokeWidth={3} />
                            </button>
                            <span className="text-white font-bold text-xs whitespace-nowrap">
                              APPROVE
                            </span>
                          </div>
                        </th>
                        {baseColsCount > 0 && (
                          <th
                            colSpan={baseColsCount}
                            className="py-2 px-3 border-r border-b border-white/40 bg-[#18476A]"
                          ></th>
                        )}
                        <th
                          colSpan={inSpanCount}
                          className="px-4 py-2 font-bold text-white text-center border-r border-b border-white/40 bg-[#18476A] whitespace-nowrap align-middle"
                        >
                          [B] IN
                        </th>
                        {purityColIndex !== -1 && (
                          <th className="py-2 px-3 border-r border-b border-white/40 bg-[#18476A]"></th>
                        )}
                        <th
                          colSpan={outSpanCount}
                          className="px-4 py-2 font-bold text-white text-center border-r border-b border-white/40 bg-[#18476A] whitespace-nowrap align-middle"
                        >
                          [C] OUT
                        </th>
                        {trailingColsCount > 0 && (
                          <th
                            colSpan={trailingColsCount}
                            className="py-2 px-3 border-r border-b border-white/40 bg-[#18476A]"
                          ></th>
                        )}
                      </tr>

                      {/* Header Row 2: Column Header Labels */}
                      <tr className="bg-[#18476A] text-white font-bold text-xs">
                        <th className="sticky left-0 bg-[#18476A] px-4 py-2 border-r border-b border-white/40 text-white text-left whitespace-nowrap align-middle">
                          #
                        </th>
                        {meltingColumns.map((colName, idx) => {
                          const displayLabel = colName.replace(
                            /\s*\(\d+\)$/,
                            "",
                          );
                          const isNum =
                            /pieces|weight|wt|fine|amt|amount|price|credit|debit/i.test(
                              colName,
                            );
                          return (
                            <th
                              key={idx}
                              className={`px-3.5 py-2 border-r border-b border-white/40 font-bold text-white whitespace-nowrap text-xs align-middle ${
                                isNum ? "text-right" : "text-left"
                              }`}
                            >
                              {displayLabel}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                  ) : (
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[#18476A] text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
                        <th className="sticky left-0 bg-[#18476A] px-5 py-3.5 border-b border-r border-white/20 text-white whitespace-nowrap align-middle">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={toggleSelectAll}
                              className={`grid h-4 w-4 place-items-center rounded border transition ${
                                selected.length === visibleGridRows.length &&
                                visibleGridRows.length > 0
                                  ? "border-emerald-400 bg-emerald-500 text-white"
                                  : "border-white/40 bg-white/10 text-transparent hover:border-white/70"
                              }`}
                            >
                              <Check size={11} strokeWidth={3} />
                            </button>
                            <span className="text-white font-bold whitespace-nowrap">
                              Approve
                            </span>
                          </div>
                        </th>
                        {columns.map((column) => {
                          const displayLabel = column.replace(
                            /\s*\(\d+\)$/,
                            "",
                          );
                          return (
                            <th
                              key={column}
                              className="border-b border-r border-white/20 bg-[#18476A] px-5 py-3.5 font-bold text-white whitespace-nowrap align-middle"
                            >
                              {displayLabel}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {visibleGridRows.map((row, index) => {
                      const origIndex =
                        typeof row._originalIndex === "number"
                          ? (row._originalIndex as number)
                          : index;
                      const groupIndices = getRelatedGroupIndices(origIndex);
                      const isFullyApproved =
                        groupIndices.length > 0 &&
                        groupIndices.every((idx) => selected.includes(idx));
                      const isPartiallyApproved =
                        !isFullyApproved &&
                        groupIndices.some((idx) => selected.includes(idx));
                      const isRowApproved =
                        isFullyApproved || selected.includes(origIndex);

                      const meta = rowGroupMeta.get(origIndex);
                      const groupId = meta?.groupId ?? index;
                      const band = getEntryBandStyle(
                        groupId,
                        entryColorPalette,
                      );

                      const prevRow =
                        index > 0 ? visibleGridRows[index - 1] : null;
                      const prevOrigIndex = prevRow
                        ? typeof prevRow._originalIndex === "number"
                          ? (prevRow._originalIndex as number)
                          : index - 1
                        : null;
                      const prevMeta =
                        prevOrigIndex !== null
                          ? rowGroupMeta.get(prevOrigIndex)
                          : null;
                      const isNewEntryStart =
                        index === 0 ||
                        (prevMeta && prevMeta.groupId !== groupId);

                      const nextRow =
                        index < visibleGridRows.length - 1
                          ? visibleGridRows[index + 1]
                          : null;
                      const nextOrigIndex = nextRow
                        ? typeof nextRow._originalIndex === "number"
                          ? (nextRow._originalIndex as number)
                          : index + 1
                        : null;
                      const nextMeta =
                        nextOrigIndex !== null
                          ? rowGroupMeta.get(nextOrigIndex)
                          : null;
                      const isLastRowOfEntry =
                        index === visibleGridRows.length - 1 ||
                        !nextMeta ||
                        nextMeta.groupId !== groupId;

                      const user = getAuthUser();
                      const currentUserName =
                        user?.name || user?.email?.split("@")[0] || "BHAVESH";

                      return (
                        <tr
                          key={origIndex}
                          className={`transition-colors duration-150 ${
                            isRowApproved
                              ? "bg-[#d3efe6] hover:bg-[#c4ebd3]"
                              : `${band.base} ${band.hover}`
                          } ${
                            isNewEntryStart && index > 0
                              ? "border-t-2 border-slate-300/80 shadow-[0_-1px_0_rgba(0,0,0,0.04)]"
                              : "border-b border-slate-100"
                          }`}
                        >
                          <td
                            className={`sticky left-0 border-r border-b border-slate-100 bg-inherit px-4 py-2.5 whitespace-nowrap align-middle ${
                              !isRowApproved && entryColorPalette !== "none"
                                ? band.border
                                : ""
                            }`}
                          >
                            {isNewEntryStart && (
                              <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => toggleApproval(origIndex)}
                                  title={
                                    isFullyApproved
                                      ? `Entry #${groupId + 1} Approved (${groupIndices.length} row${groupIndices.length > 1 ? "s" : ""}) - click to deselect`
                                      : isPartiallyApproved
                                        ? `Entry #${groupId + 1} Partially Selected - click to select all`
                                        : `Approve Entry #${groupId + 1} (${groupIndices.length} row${groupIndices.length > 1 ? "s" : ""})`
                                  }
                                  className={`grid h-5 w-5 place-items-center rounded border transition ${
                                    isFullyApproved
                                      ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                                      : isPartiallyApproved
                                        ? "border-emerald-500 bg-emerald-100 text-emerald-800 shadow-sm"
                                        : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                                  }`}
                                >
                                  {isFullyApproved ? (
                                    <Check size={13} strokeWidth={3} />
                                  ) : isPartiallyApproved ? (
                                    <Minus size={13} strokeWidth={3} />
                                  ) : (
                                    <Check size={13} strokeWidth={3} />
                                  )}
                                </button>
                                {isRowApproved && (
                                  <span className="inline-flex items-center rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap">
                                    By - {currentUserName}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {gridDisplayColumns.map((column) => {
                            const isPurityCol =
                              isMelting && /purity/i.test(column);
                            const rawRowPurity = String(
                              row[column] ?? "",
                            ).trim();
                            const hasRowPurity =
                              rawRowPurity !== "" &&
                              rawRowPurity !== "—" &&
                              rawRowPurity !== "-" &&
                              rawRowPurity.toLowerCase() !== "null" &&
                              rawRowPurity.toLowerCase() !== "undefined";

                            const purityValue = isPurityCol
                              ? hasRowPurity
                                ? rawRowPurity.includes("%") ||
                                  isNaN(Number(rawRowPurity.replace(/%/g, "")))
                                  ? rawRowPurity
                                  : `${Number(rawRowPurity.replace(/%/g, "")).toFixed(2)}%`
                                : calculateRowPurity(
                                    row,
                                    columns,
                                    groupIndices,
                                    rows,
                                  )
                              : "";
                            const isNum =
                              /pieces|weight|wt|fine|amt|amount|price|credit|debit|purity/i.test(
                                column,
                              );

                            return (
                              <td
                                key={column}
                                className={`border-b border-l border-slate-100 px-4 py-2.5 text-xs font-medium whitespace-nowrap align-middle ${
                                  isNum ? "text-right font-mono" : "text-left"
                                } ${
                                  isPurityCol
                                    ? "font-bold text-emerald-900"
                                    : "text-slate-700"
                                }`}
                              >
                                {isPurityCol ? (
                                  purityValue !== "—" && purityValue !== "" ? (
                                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200 shadow-xs whitespace-nowrap">
                                      {purityValue}
                                    </span>
                                  ) : isLastRowOfEntry ? (
                                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200 shadow-xs whitespace-nowrap">
                                      {purityValue}
                                    </span>
                                  ) : (
                                    "—"
                                  )
                                ) : column === typeKey ? (
                                  <span
                                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                                      /debit/i.test(row[column])
                                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                                        : /credit/i.test(row[column])
                                          ? "bg-teal-50 text-teal-700 border border-teal-200"
                                          : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {row[column]}
                                  </span>
                                ) : (
                                  row[column] || "—"
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  {Object.keys(grandTotals).length > 0 && (
                    <tfoot>
                      <tr className="sticky bottom-0 border-t-2 border-[#123955] bg-[#18476A] text-white">
                        <td className="sticky left-0 z-30 bg-[#18476A] px-4 py-3 text-xs font-bold whitespace-nowrap min-w-[140px] align-middle border-r border-white/20">
                          Grand Total ({visibleGridRows.length} entries)
                        </td>
                        {gridDisplayColumns.map((column) => {
                          const isPurityCol =
                            isMelting && /purity/i.test(column);
                          return (
                            <td
                              key={column}
                              className="border-l border-white/10 px-4 py-3 text-right text-xs font-bold whitespace-nowrap align-middle font-mono"
                            >
                              {isPurityCol ? (
                                <span className="inline-flex items-center rounded-md bg-emerald-400/20 px-2.5 py-1 text-xs font-bold text-emerald-200 border border-emerald-400/30 whitespace-nowrap">
                                  {grandTotalPurity}
                                </span>
                              ) : numericColumnsForTotals.includes(column) ? (
                                (grandTotals[column] ?? 0).toLocaleString(
                                  "en-IN",
                                  {
                                    minimumFractionDigits: Number.isInteger(
                                      grandTotals[column] ?? 0,
                                    )
                                      ? 0
                                      : /wt|weight|fine/i.test(column)
                                        ? 3
                                        : 2,
                                    maximumFractionDigits: 3,
                                  },
                                )
                              ) : (
                                ""
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
                {visibleGridRows.length === 0 && (
                  <div className="p-12 text-center text-sm text-slate-400">
                    No matching rows found in this report. Try resetting your
                    query or filters.
                  </div>
                )}
              </div>
            )}

            {/* 3. Analytics View */}
            {effectiveViewMode === "analytics" && (
              <div className="p-6">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <PieChart size={16} className="text-[#18476A]" />
                  Report Data Breakdown &amp; Distribution
                </h4>
                <div className="grid gap-4 sm:grid-cols-3 mb-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <span className="text-xs text-slate-500 font-semibold">
                      Total Records
                    </span>
                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      {filteredRows.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <span className="text-xs text-slate-500 font-semibold">
                      Approved Records
                    </span>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">
                      {selected.length} (
                      {filteredRows.length
                        ? Math.round(
                            (selected.length / filteredRows.length) * 100,
                          )
                        : 0}
                      %)
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <span className="text-xs text-slate-500 font-semibold">
                      Detected Fields
                    </span>
                    <p className="mt-1 text-2xl font-bold text-[#18476A]">
                      {columns.length}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h5 className="text-xs font-bold text-slate-700 mb-3">
                    Detected Columns Catalog
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {columns.map((col) => (
                      <span
                        key={col}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Footer & Approval Action */}
            <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <p className="text-[11px] text-slate-400">
                Showing{" "}
                <span className="font-semibold text-slate-600">
                  {filteredRows.length}
                </span>{" "}
                of {rows.length} rows ·{" "}
                <span className="font-semibold text-emerald-600">
                  {selected.length} marked approved
                </span>
              </p>
              <button
                type="button"
                onClick={saveApprovalsToBackend}
                disabled={selected.length === 0}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={15} />
                Save {selected.length} Approved Entries
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
