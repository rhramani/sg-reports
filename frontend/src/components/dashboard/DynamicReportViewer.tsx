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
  Trash2,
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
  if (/[a-zA-Z]/.test(str)) return null;

  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(str)) return null;

  const cleaned = str.replace(/[, \s]/g, "");

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

function detectGroupKeyColumn(
  rows: Record<string, any>[],
  columns: string[],
): string | null {
  if (!rows.length || !columns.length) return null;

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

  const partyCol = columns.find(
    (c) =>
      /party|account|customer|vendor|client|name/i.test(c.trim()) &&
      !/wt|weight|fine|amt|amount|price|cost|balance|piece|pcs|qty|type|book/i.test(
        c.trim(),
      ),
  );
  if (partyCol && isUsableKey(partyCol)) return partyCol;

  const firstColIsBook = /^book/i.test(columns[0]?.trim() ?? "");
  if (firstColIsBook) {
    const nonBookCols = columns.filter((c) => !/^book/i.test(c.trim()));
    for (const col of nonBookCols) {
      if (
        /wt|weight|fine|amt|amount|price|credit|debit|cost|balance|qty|quantity|piece|pcs/i.test(
          col,
        )
      ) {
        continue;
      }
      if (isUsableKey(col)) return col;
    }
  }

  const txnCol = columns.find((c) =>
    /voucher|transaction\s*no|trans\s*no|vou\.?\s*no|entry\s*no|ref\s*no|doc\s*no|journal\s*no|bill\s*no|inv\s*no|sr\.?\s*no|sl\.?\s*no/i.test(
      c.trim(),
    ),
  );
  if (txnCol && isUsableKey(txnCol)) return txnCol;

  const broadTxnCol = columns.find((c) =>
    /voucher|transaction|trans/i.test(c.trim()),
  );
  if (broadTxnCol && isUsableKey(broadTxnCol)) return broadTxnCol;

  const entryCol = columns.find((c) =>
    /entry\b|ref\b|doc\b|journal\b|bill\b|inv\b/i.test(c.trim()),
  );
  if (entryCol && isUsableKey(entryCol)) return entryCol;

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

  const typeCol = columns.find((c) =>
    /type|category|nature|dr.?cr|credit.?debit|p\.?type|inout/i.test(c.trim()),
  );

  if (groupKeyColumn) {
    let groupId = -1;
    let lastSeenVal = "";
    let lastSeenType = "";

    rows.forEach((r, i) => {
      const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
      const isTotal = isSubtotalRow(r, columns);
      const v = String(r[groupKeyColumn] ?? "").trim();
      const t = typeCol ? String(r[typeCol] ?? "").trim() : "";

      if (isTotal) {
        meta.set(idx, { groupId: Math.max(0, groupId), isTotalRow: true });
        lastSeenVal = "";
        lastSeenType = "";
        return;
      }

      if (v !== "") {
        if (v !== lastSeenVal || (t !== "" && t !== lastSeenType) || groupId === -1) {
          groupId++;
          lastSeenVal = v;
          if (t !== "") lastSeenType = t;
        }
      } else {
        if (groupId === -1) groupId = 0;
        if (t !== "" && t !== lastSeenType) {
          groupId++;
          if (t !== "") lastSeenType = t;
        }
      }

      meta.set(idx, { groupId, isTotalRow: false });
    });

    return meta;
  }

  const fallbackKeyCol = columns.find((c) =>
    /voucher|transaction|trans|vou|entry|ref|doc|journal|bill|inv|sr|sl|date|party/i.test(
      c,
    ),
  );

  if (fallbackKeyCol) {
    let groupId = -1;
    let lastVal = "";
    let lastType = "";

    rows.forEach((r, i) => {
      const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
      const isTotal = isSubtotalRow(r, columns);
      const v = String(r[fallbackKeyCol] ?? "").trim();
      const t = typeCol ? String(r[typeCol] ?? "").trim() : "";

      if (isTotal) {
        meta.set(idx, { groupId: Math.max(0, groupId), isTotalRow: true });
        lastVal = "";
        lastType = "";
        return;
      }

      if ((v !== "" && v !== lastVal) || (t !== "" && t !== lastType)) {
        groupId++;
        lastVal = v;
        if (t !== "") lastType = t;
      }
      if (groupId === -1) groupId = 0;

      meta.set(idx, { groupId, isTotalRow: false });
    });

    return meta;
  }

  rows.forEach((r, i) => {
    const idx = typeof r._originalIndex === "number" ? r._originalIndex : i;
    meta.set(idx, { groupId: i, isTotalRow: isSubtotalRow(r, columns) });
  });

  return meta;
}

function detectNumericColumns(rows: Record<string, any>[], columns: string[]) {
  return columns.filter((col) => {
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

  const typeCol = columns.find((c) =>
    /type|category|nature|dr.?cr|credit.?debit|p\.?type|inout/i.test(c.trim()),
  );

  const isNumericCol = (col: string) =>
    /wt|weight|fine|amt|amount|price|credit|debit|total|cost|balance|qty|quantity|piece|pcs/i.test(
      col,
    );

  const isItemOrDetailCol = (col: string) =>
    /remark|narra?tion|item|product|description|detail|note|comment|particular/i.test(
      col.trim(),
    ) && !/book|head|party|account|customer|vendor|company|owner/i.test(col.trim());

  const isGlobalHeaderCol = (col: string) =>
    !isItemOrDetailCol(col);

  const isVoucherIdCol = (col: string) =>
    /voucher|transaction|vou\.?no|transno|ref\.?no|doc\.?no|entry\.?no|sr\.?no|sl\.?no|bill\.?no|inv\.?no/i.test(
      col.trim(),
    );

  const globalHeaderContext: Record<string, string> = {};
  let entryHeaderContext: Record<string, string> = {};

  let currentTransKeyVal = "";
  let currentGroupTypeVal = "";
  let currentMainEntry: Record<string, any> | null = null;

  return rows.map((row) => {
    if (isSubtotalRow(row, columns)) {
      entryHeaderContext = {};
      currentMainEntry = null;
      return { ...row };
    }

    const groupVal = groupKeyCol ? String(row[groupKeyCol] ?? "").trim() : "";
    const transVal = transactionKeyCol
      ? String(row[transactionKeyCol] ?? "").trim()
      : "";
    const rowTypeVal = typeCol ? String(row[typeCol] ?? "").trim() : "";

    const activeKeyVal = groupKeyCol ? groupVal : transVal;

    const isNewTypeSection =
      rowTypeVal !== "" && rowTypeVal !== currentGroupTypeVal;
    const isNewKeyGroup =
      activeKeyVal !== "" && activeKeyVal !== currentTransKeyVal;
    const isNewGroup =
      isNewKeyGroup || isNewTypeSection || currentMainEntry === null;

    if (isNewKeyGroup) {
      entryHeaderContext = {};
    }

    for (const col of columns) {
      if (isNumericCol(col)) continue;
      const val = String(row[col] ?? "").trim();
      if (val !== "" && val !== "—") {
        if (isGlobalHeaderCol(col)) {
          globalHeaderContext[col] = val;
        } else {
          entryHeaderContext[col] = val;
        }
      }
    }

    if (isNewGroup) {
      if (activeKeyVal !== "") currentTransKeyVal = activeKeyVal;
      if (rowTypeVal !== "") currentGroupTypeVal = rowTypeVal;

      const newMain = { ...row };
      for (const [hCol, hVal] of Object.entries({
        ...globalHeaderContext,
        ...entryHeaderContext,
      })) {
        const cVal = String(newMain[hCol] ?? "").trim();
        if (cVal === "" || cVal === "—") {
          newMain[hCol] = hVal;
        }
      }
      currentMainEntry = newMain;
      return newMain;
    }

    const filledRow = { ...row };

    const mergedContext = {
      ...globalHeaderContext,
      ...entryHeaderContext,
      ...(currentMainEntry || {}),
    };

    for (const [col, val] of Object.entries(mergedContext)) {
      if (col === "_originalIndex" || isNumericCol(col))
        continue;
      const currentVal = String(filledRow[col] ?? "").trim();
      const fillVal = String(val ?? "").trim();
      if (
        (currentVal === "" || currentVal === "—") &&
        fillVal !== "" &&
        fillVal !== "—"
      ) {
        filledRow[col] = fillVal;
      }
    }

    return filledRow;
  });
}

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

export function zeroAlloyOutPureWeight(
  rows: Record<string, any>[],
  columns: string[],
): Record<string, any>[] {
  if (!rows.length) return rows;

  return rows.map((row) => {
    if (!isAlloyItem(row)) return row;

    const updated = { ...row };

    const outPureCols = Object.keys(updated).filter((col) =>
      /\b(out|side2|\(2\)|_1|_2)\b.*pure|pure.*(out|side2|\(2\)|_1|_2)|\bpure\s*wt\s*\(2\)|\bout\s*pure\s*wt|\bpure\s*weight\s*\(2\)/i.test(
        col,
      ),
    );

    outPureCols.forEach((col) => {
      updated[col] = "0";
    });

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
      const rowA: Record<string, any> = { ...row };
      side2Cols.forEach((col) => {
        rowA[col] = "";
      });

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
      if (Number.isFinite(num) && num > 0) {
        return rawVal.includes("%") ? rawVal : `${num.toFixed(2)}%`;
      }
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

  const pureWtCols = columns.filter((c) => /pure\s*(wt|weight)/i.test(c.trim()));
  let outPureWeightColumn =
    findColumn(
      ["Pure Wt (2)", "Pure Weight (2)"],
      /^pure\s*(wt|weight)\s*\(2\)$/i,
    ) ||
    columns.find((c) => /out.*pure|pure.*\(2\)|pure.*out/i.test(c.trim()));

  if (!outPureWeightColumn && pureWtCols.length > 1) {
    outPureWeightColumn = pureWtCols[pureWtCols.length - 1];
  } else if (!outPureWeightColumn && pureWtCols.length === 1) {
    outPureWeightColumn = pureWtCols[0];
  }

  const weightCols = columns.filter((c) => /^weight$|in.*wt/i.test(c.trim()) && !/pure/i.test(c));
  let inWeightColumn =
    findColumn(["Weight"], /^weight$/i) ||
    columns.find((c) => /in.*wt/i.test(c.trim())) ||
    weightCols[0];

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

    if (currentTransNo && currentTransNo !== "—") {
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

  const pureWtCols = columns.filter((c) => /pure\s*(wt|weight)/i.test(c.trim()));
  let outPureWeightColumn =
    findColumn(
      ["Pure Wt (2)", "Pure Weight (2)"],
      /^pure\s*(wt|weight)\s*\(2\)$/i,
    ) ||
    columns.find((c) => /out.*pure|pure.*\(2\)|pure.*out/i.test(c.trim()));

  if (!outPureWeightColumn && pureWtCols.length > 1) {
    outPureWeightColumn = pureWtCols[pureWtCols.length - 1];
  } else if (!outPureWeightColumn && pureWtCols.length === 1) {
    outPureWeightColumn = pureWtCols[0];
  }

  const weightCols = columns.filter((c) => /^weight$|in.*wt/i.test(c.trim()) && !/pure/i.test(c));
  let inWeightColumn =
    findColumn(["Weight"], /^weight$/i) ||
    columns.find((c) => /in.*wt/i.test(c.trim())) ||
    weightCols[0];

  const itemColumn = columns.find((column) =>
    /^(item|description|product|particular)$/i.test(column.trim()),
  );

  let totalInWeight = 0;
  let totalOutPureWeight = 0;

  if (inWeightColumn && outPureWeightColumn) {
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

    if (totalInWeight > 0) {
      const purity = (totalOutPureWeight / totalInWeight) * 100;
      return `${purity.toFixed(2)}%`;
    }
  }

  const purityKey = columns.find((c) => /purity/i.test(c.trim()));
  if (purityKey) {
    let weightedSum = 0;
    let totalWt = 0;
    let simpleSum = 0;
    let count = 0;

    targetRows.forEach((r) => {
      const pVal = parseNum(r[purityKey]);
      const wtVal = inWeightColumn ? parseNum(r[inWeightColumn]) : 0;
      if (pVal > 0) {
        if (wtVal > 0) {
          weightedSum += pVal * wtVal;
          totalWt += wtVal;
        }
        simpleSum += pVal;
        count++;
      }
    });

    if (totalWt > 0) {
      return `${(weightedSum / totalWt).toFixed(2)}%`;
    }
    if (count > 0) {
      return `${(simpleSum / count).toFixed(2)}%`;
    }
  }

  return "—";
}

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

interface LedgerPaneRow {
  row: Record<string, any>;
  index: number;
  group: string;
  groupId: number;
}

interface LedgerPaneProps {
  title: string;
  tone: "debit" | "credit";
  rows: LedgerPaneRow[];
  columns: string[];
  transactionKey: string;
  typeKey: string;
  amountKey: string;
  numericKeys: string[];
  selected: number[];
  toggleApproval: (index: number) => void;
  getRelatedGroupIndices?: (index: number) => number[];
  entryColorPalette?: EntryColorPaletteKey;
  onDeleteRow?: (index: number) => void;
  canDelete?: boolean;
}

interface LedgerRenderItem {
  kind: "row";
  row: Record<string, any>;
  index: number;
  group: string;
  groupId: number;
  bandIndex: number;
  isNewEntryStart: boolean;
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
  entryColorPalette = "classic",
  onDeleteRow,
  canDelete = false,
}: LedgerPaneProps) {
  const isDebit = tone === "debit";

  const displayColumns = columns.filter((col) => col !== "_originalIndex");

  const textColumns = displayColumns.filter(
    (column) => column !== amountKey && !numericKeys.includes(column),
  );

  const parseAmt = (val: any) => {
    if (!val) return 0;
    const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? 0 : num;
  };

  const formatAmt = (num: number, col: string) =>
    (num || 0).toLocaleString("en-IN", {
      minimumFractionDigits: /wt|weight|fine/i.test(col) ? 3 : 2,
      maximumFractionDigits: 3,
    });

  const toneText = isDebit ? "text-[#8f5039]" : "text-[#126c65]";
  const toneHeaderBorder = isDebit
    ? "border-[#d9c2b5] bg-[#ead8ce]"
    : "border-[#b9d0cc] bg-[#dcece9]";

  const paneGrandTotal: Record<string, number> = {};
  numericKeys.forEach((nk) => (paneGrandTotal[nk] = 0));

  const renderItems: LedgerRenderItem[] = [];
  let i = 0;
  let bandIndex = -1;
  while (i < rows.length) {
    const groupId = rows[i].groupId;
    bandIndex++;
    const groupRows: LedgerPaneRow[] = [];
    while (i < rows.length && rows[i].groupId === groupId) {
      groupRows.push(rows[i]);
      i++;
    }
    groupRows.forEach(({ row, index, group }, gi) => {
      renderItems.push({
        kind: "row",
        row,
        index,
        group,
        groupId,
        bandIndex,
        isNewEntryStart: gi === 0,
      });
      numericKeys.forEach((nk) => {
        paneGrandTotal[nk] += parseAmt(row[nk]);
      });
    });
  }

  const activeNumericKeys = useMemo(() => {
    const active = numericKeys.filter((nk) => {
      if (rows.length > 0) {
        const allZero = rows.every((r) => parseAmt(r.row[nk]) === 0);
        if (allZero) return false;
      }
      return true;
    });
    return active.length > 0 ? active : numericKeys;
  }, [numericKeys, rows]);

  return (
    <div
      className={`min-w-[420px] flex-1 ${
        isDebit ? "bg-[#faf5f2]" : "border-r border-[#c8b3a7] bg-[#f3f8f7]"
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-4 py-2.5 ${toneHeaderBorder}`}
      >
        <span
          className={`text-[11px] font-bold uppercase tracking-[0.14em] ${toneText}`}
        >
          {title}
        </span>
        <span
          className={`rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold ${toneText}`}
        >
          {rows.length} entries
        </span>
      </div>

      {/* Scrollable DataTable-style body — sticky header + sticky checkbox
          column, matching the Standard Tabular Grid View. */}
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#18476A] text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
              <th className="sticky left-0 top-0 z-30 w-9 border-r border-b border-white/20 bg-[#18476A] px-3.5 py-2.5 whitespace-nowrap align-middle">
                Check
              </th>
              {textColumns.map((column) => (
                <th
                  key={column}
                  className="border-r border-b border-white/20 bg-[#18476A] px-3.5 py-2.5 whitespace-nowrap align-middle"
                >
                  {column}
                </th>
              ))}
              {activeNumericKeys.map((nk) => (
                <th
                  key={nk}
                  className="border-r border-b border-white/20 bg-[#18476A] px-3.5 py-2.5 text-right whitespace-nowrap align-middle"
                >
                  {nk}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderItems.map((item) => {
              const { row, index, group, groupId, bandIndex, isNewEntryStart } =
                item;
              const groupIndices = getRelatedGroupIndices
                ? getRelatedGroupIndices(index)
                : [index];
              const isFullyApproved =
                groupIndices.length > 0 &&
                groupIndices.every((idx) => selected.includes(idx));
              const isPartiallyApproved =
                !isFullyApproved &&
                groupIndices.some((idx) => selected.includes(idx));
              const isRowApproved =
                isFullyApproved || selected.includes(index);

              const band = getEntryBandStyle(bandIndex, entryColorPalette);
              const user = getAuthUser();
              const currentUserName =
                user?.name || user?.email?.split("@")[0] || "BHAVESH";

              return (
                <tr
                  key={`${group}-${index}`}
                  className={`transition-colors duration-150 ${
                    isRowApproved
                      ? "bg-[#d3efe6] hover:bg-[#c4ebd3]"
                      : `${band.base} ${band.hover}`
                  } ${
                    isNewEntryStart
                      ? "border-t-2 border-slate-300/80"
                      : "border-t border-slate-100"
                  } border-b border-slate-100`}
                >
                  <td
                    className={`sticky left-0 bg-inherit px-3.5 py-2.5 align-top whitespace-nowrap ${
                      !isRowApproved && entryColorPalette !== "none"
                        ? band.border
                        : ""
                    }`}
                  >
                    {isNewEntryStart && (
                      <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleApproval(index)}
                            title={
                              isFullyApproved
                                ? `Entry #${groupId + 1} Approved (${groupIndices.length} row${groupIndices.length > 1 ? "s" : ""}) - click to deselect`
                                : isPartiallyApproved
                                  ? `Entry #${groupId + 1} Partially Selected - click to select all`
                                  : `Approve Entry #${groupId + 1} (${groupIndices.length} row${groupIndices.length > 1 ? "s" : ""})`
                            }
                            className={`grid h-4 w-4 place-items-center rounded border transition ${
                              isFullyApproved
                                ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                                : isPartiallyApproved
                                  ? "border-emerald-500 bg-emerald-100 text-emerald-800 shadow-xs"
                                  : "border-slate-400 bg-white text-transparent hover:border-slate-600"
                            }`}
                          >
                            {isPartiallyApproved ? (
                              <Minus size={12} strokeWidth={3} />
                            ) : (
                              <Check size={12} strokeWidth={3} />
                            )}
                          </button>
                          {canDelete && onDeleteRow && (
                            <button
                              type="button"
                              onClick={() => onDeleteRow(index)}
                              className="p-0.5 text-slate-400 hover:text-rose-600 transition rounded hover:bg-rose-50"
                              title="Delete entry"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        {isRowApproved && (
                          <span className="inline-flex items-center rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap">
                            By - {currentUserName}
                          </span>
                        )}
                      </div>
                    )}
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
                  {activeNumericKeys.map((nk) => (
                    <td
                      key={nk}
                      className={`whitespace-nowrap px-3.5 py-2.5 text-right align-top text-xs font-bold ${toneText}`}
                    >
                      {row[nk] || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  onDeleteRow?: (index: number) => void;
  canDelete?: boolean;
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
  onDeleteRow,
  canDelete = false,
}: LedgerTableViewProps) {
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

  const numericKeys = displayCols.filter((col) => {
    if (
      /date|time|year|month|day|sr|sl|code|id|ref|vou|doc|audit/i.test(
        col.trim(),
      )
    ) {
      return false;
    }
    if (
      /wt|weight|fine|amt|amount|price|credit|debit|total|cost|balance/i.test(
        col,
      )
    )
      return true;
    const sample = rows.slice(0, 10);
    if (!sample.length) return false;
    const numCount = sample.filter((r) => {
      const val = String(r[col] ?? "").trim();
      if (!val) return false;
      if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(val)) return false;
      return !isNaN(Number(val));
    }).length;
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
  const allEntries = rows.map((row, loopIndex) => {
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
    const meta = rowGroupMeta?.get(origIndex);
    return {
      row,
      index: origIndex,
      group: currentGroup,
      groupId: meta?.groupId ?? origIndex,
      isTotalRow: meta?.isTotalRow ?? false,
    };
  });

  const entries = allEntries.filter((e) => !e.isTotalRow);

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
            entryColorPalette={entryColorPalette}
            onDeleteRow={onDeleteRow}
            canDelete={canDelete}
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
            entryColorPalette={entryColorPalette}
            onDeleteRow={onDeleteRow}
            canDelete={canDelete}
          />
        </div>

        {/* Dynamic Ledger Summary Footer — whole-report calculation */}
        <div className="border-t-2 border-[#18476A] bg-[#f8fafc] text-xs font-sans shadow-xs">
          {/* Row 1: Verify / Unverify / Sub Total */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7] border-b border-[#c8b3a7]/60">
            {/* Credit Side (left) */}
            <div className="grid grid-cols-4 items-center bg-[#edf6f4] px-3 py-2 text-slate-700">
              <div className="text-center font-medium">
                Verify :{" "}
                <span className="font-bold text-[#126c65]">
                  {formatNum(creditVerified, isWeight)}
                </span>
              </div>
              <div className="text-center font-medium">
                Unverify :{" "}
                <span className="font-bold text-[#18476A]">
                  {formatNum(creditUnverified, isWeight)}
                </span>
              </div>
              <div className="text-right font-bold text-[#0f524d] pr-2">
                Sub Total
              </div>
              <div className="text-right font-extrabold text-[#0c4440] font-mono text-[12.5px] pr-2">
                {formatNum(creditSubTotal, isWeight)}
              </div>
            </div>
            {/* Debit Side (right) */}
            <div className="grid grid-cols-4 items-center bg-[#f6ece6] px-3 py-2 text-slate-700">
              <div className="text-center font-medium">
                Verify :{" "}
                <span className="font-bold text-[#8f5039]">
                  {formatNum(debitVerified, isWeight)}
                </span>
              </div>
              <div className="text-center font-medium">
                Unverify :{" "}
                <span className="font-bold text-[#18476A]">
                  {formatNum(debitUnverified, isWeight)}
                </span>
              </div>
              <div className="text-right font-bold text-[#733f2b] pr-2">
                Sub Total
              </div>
              <div className="text-right font-extrabold text-[#5c3121] font-mono text-[12.5px] pr-2">
                {formatNum(debitSubTotal, isWeight)}
              </div>
            </div>
          </div>

          {/* Row 2: Total Issue / Total Receipt */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7] border-b border-[#c8b3a7]/60">
            {/* Credit Side Total Issue (left) */}
            <div className="grid grid-cols-4 items-center bg-[#e1f1ed] px-3 py-2.5">
              <div className="col-span-3 text-right font-extrabold uppercase tracking-wider text-[11px] text-[#0e5c56] pr-2">
                Total Issue
              </div>
              <div className="text-right font-black text-[#083c38] font-mono text-[13px] pr-2">
                {formatNum(creditSubTotal, isWeight)}
              </div>
            </div>
            {/* Debit Side Total Receipt (right) */}
            <div className="grid grid-cols-4 items-center bg-[#f3e3d9] px-3 py-2.5">
              <div className="col-span-3 text-right font-extrabold uppercase tracking-wider text-[11px] text-[#7e432d] pr-2">
                Total Receipt
              </div>
              <div className="text-right font-black text-[#522919] font-mono text-[13px] pr-2">
                {formatNum(debitSubTotal, isWeight)}
              </div>
            </div>
          </div>

          {/* Row 3: Closing Balance */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7] bg-[#18476A] text-white">
            <div className="flex items-center justify-between px-4 py-2 bg-[#0f344f]">
              <span className="text-[10.5px] font-semibold text-teal-200/90 uppercase tracking-widest">
                Ledger Balance Summary
              </span>
            </div>
            <div className="grid grid-cols-4 items-center bg-[#18476A] px-3 py-2.5">
              <div className="col-span-3 text-right font-black uppercase tracking-wider text-[11.5px] text-amber-300 pr-2">
                Closing Balance
              </div>
              <div className="text-right font-black font-mono text-[14px] text-white pr-2">
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

  const [filterOptions, setFilterOptions] = useState<{
    types: string[];
    owners: string[];
    statuses: string[];
  }>({ types: [], owners: [], statuses: [] });
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const extractReportDate = (rows: Record<string, any>[]): string | null => {
    if (!rows || !rows.length) return null;
    const sample = rows.slice(0, 30);
    const dateCol = Object.keys(sample[0] || {}).find((k) =>
      /date|dt|time|day/i.test(k.trim()),
    );
    if (!dateCol) return null;

    for (const r of sample) {
      const val = String(r[dateCol] ?? "").trim();
      if (!val || val === "—" || val === "-") continue;

      const ddmmyyyy = val.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/);
      if (ddmmyyyy) {
        const [, d, m, y] = ddmmyyyy;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }

      const yyyymmdd = val.match(/^(\d{4})[/\-. ](\d{1,2})[/\-. ](\d{1,2})$/);
      if (yyyymmdd) {
        const [, y, m, d] = yyyymmdd;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }

    return null;
  };

  const [startDate, setStartDate] = useState<string>(getTodayDateString());
  const [endDate, setEndDate] = useState<string>(getTodayDateString());

  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState("");

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  };

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

  const refreshAllData = async (
    sDate?: string,
    eDate?: string,
    typeVal?: string,
    ownerVal?: string,
    statusVal?: string,
    searchVal?: string,
  ) => {
    await Promise.all([
      loadFilterOptions(sDate !== undefined ? sDate : startDate, eDate !== undefined ? eDate : endDate),
      loadSavedReports(sDate, eDate, typeVal, ownerVal, statusVal, searchVal),
    ]);
  };

  const selectReport = async (report: ReportItem) => {
    const id = report._id || report.reportId || "";
    setSelectedReportId(id);
    setReportId(report.reportId || id);
    setFileName(report.name);
    setActiveReportMeta(report);
    setActiveHeaderStructure((report as any).headerStructure || null);
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

      backendHeaderStructure = {
        ...headerStructure,
        subHeaders: updatedSubHeaders,
      };
    }
    setActiveHeaderStructure(backendHeaderStructure);

    const extractedDate = extractReportDate(cleanBackendData);
    const reportDate = extractedDate || startDate || getTodayDateString();

    let targetStartDate = startDate;
    let targetEndDate = endDate;

    if (reportDate) {
      if (!targetStartDate || reportDate < targetStartDate) {
        targetStartDate = reportDate;
        setStartDate(reportDate);
      }
      if (!targetEndDate || reportDate > targetEndDate) {
        targetEndDate = reportDate;
        setEndDate(reportDate);
      }
    }

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
          createdAt: reportDate,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setReportId(data.data.reportId || data.data._id || "");
        setActiveReportMeta(data.data);
        if (parsed.length <= 500) {
          backendMsg = `Report "${cleanName}" uploaded and saved to backend!`;
        }
        await refreshAllData(targetStartDate, targetEndDate);
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
    if (inputRef.current) inputRef.current.value = "";
  };

  const columns = useMemo(() => {
    if (!rows.length) return [];

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

    if (activeReportHeaders.length > 0) {
      const rowColSet = new Set(rowDerivedCols);
      const fromSaved = activeReportHeaders.filter(
        (h) => h !== "_originalIndex" && rowColSet.has(h),
      );
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
    if (!rows.length) return false;

    if (explicitEntryTypeColumn) {
      const hasTypeVal = rows.some((row) => {
        const typeVal = String(row[explicitEntryTypeColumn] ?? "")
          .trim()
          .toLowerCase();
        if (!typeVal) return false;
        return /credit|debit|\bcr\b|\bdr\b|receipt|payment|issue|receive|\[01\]|\[02\]/.test(
          typeVal,
        );
      });
      if (hasTypeVal) return true;
    }

    const hasDebitCol = columns.some((c) =>
      /debit|dr\.?$/i.test(c.trim()),
    );
    const hasCreditCol = columns.some((c) =>
      /credit|cr\.?$/i.test(c.trim()),
    );
    if (hasDebitCol || hasCreditCol) return true;

    if (
      activeHeaderStructure?.hasCreditDebit ||
      activeHeaderStructure?.layoutMode === "ledger"
    ) {
      return true;
    }

    return false;
  }, [rows, explicitEntryTypeColumn, columns, activeHeaderStructure]);

  const effectiveViewMode =
    viewMode === "auto"
      ? hasCreditDebitEntries
        ? "ledger"
        : "grid"
      : viewMode;

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

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
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
    if (!isMelting || !visibleGridRows.length) return "—";
    return calculateOverallPurity(visibleGridRows, columns);
  }, [isMelting, visibleGridRows, columns]);

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

  const [deleteReportModalOpen, setDeleteReportModalOpen] = useState(false);
  const [deletingReport, setDeletingReport] = useState(false);

  const handleDeleteReport = () => {
    const targetId =
      selectedReportId || reportId || activeReportMeta?._id || activeReportMeta?.reportId;
    if (!targetId) {
      setNotice("No report is currently loaded to delete.");
      window.setTimeout(() => setNotice(""), 3000);
      return;
    }
    setDeleteReportModalOpen(true);
  };

  const confirmDeleteReport = async () => {
    const targetId =
      selectedReportId || reportId || activeReportMeta?._id || activeReportMeta?.reportId;
    if (!targetId) return;

    setDeletingReport(true);
    try {
      const res = await authFetch(`/api/reports/${targetId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setNotice(
          data.message ||
            `Report '${fileName || activeReportMeta?.name || "Report"}' deleted successfully.`,
        );
        window.setTimeout(() => setNotice(""), 4000);

        setRows([]);
        setSelectedReportId("");
        setReportId("");
        setFileName("");
        setActiveReportMeta(null);
        setActiveHeaderStructure(null);
        setActiveReportHeaders([]);
        setSelected([]);

        await refreshAllData();
      } else {
        setNotice(data.error || "Failed to delete report.");
        window.setTimeout(() => setNotice(""), 4000);
      }
    } catch (err) {
      console.error("Delete report error:", err);
      setNotice("Error deleting report.");
      window.setTimeout(() => setNotice(""), 4000);
    } finally {
      setDeletingReport(false);
      setDeleteReportModalOpen(false);
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

            {/* Single Report Delete Button */}
            {permissions.delete && (
              <button
                type="button"
                disabled={!(selectedReportId || reportId || activeReportMeta)}
                onClick={handleDeleteReport}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition shadow-xs ${
                  selectedReportId || reportId || activeReportMeta
                    ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-400 cursor-pointer"
                    : "border-slate-200 bg-slate-50 text-slate-400 opacity-60 cursor-not-allowed"
                }`}
                title={
                  selectedReportId || reportId || activeReportMeta
                    ? `Delete entire report "${fileName || activeReportMeta?.name || ""}"`
                    : "No active report selected to delete"
                }
              >
                <Trash2
                  size={14}
                  className={
                    selectedReportId || reportId || activeReportMeta
                      ? "text-rose-600"
                      : "text-slate-400"
                  }
                />
                Delete Report
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={async () => {
                await refreshAllData();
                if (activeReportMeta) {
                  selectReport(activeReportMeta);
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
                rows={visibleGridRows}
                columns={columns}
                transactionKey={transactionKey!}
                typeKey={typeKey!}
                amountKey={amountKey!}
                selected={selected}
                toggleApproval={toggleApproval}
                getRelatedGroupIndices={getRelatedGroupIndices}
                rowGroupMeta={rowGroupMeta}
                entryColorPalette={entryColorPalette}
                canDelete={false}
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
                                <div className="flex items-center gap-1.5">
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
                                </div>
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
                              rawRowPurity.toLowerCase() !== "undefined" &&
                              rawRowPurity !== "0.00%" &&
                              rawRowPurity !== "0%" &&
                              rawRowPurity !== "0";

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
                                  isNewEntryStart && purityValue !== "—" && purityValue !== "" ? (
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
                                grandTotalPurity
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

      {/* ── Report Delete Confirmation Modal ── */}
      {deleteReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 border border-slate-100">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Entire Report</h3>
                <p className="text-xs text-slate-500">
                  {fileName || activeReportMeta?.name || "Selected Report"}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Are you sure you want to permanently delete the report{" "}
              <strong className="text-slate-900 font-semibold">
                "{fileName || activeReportMeta?.name || "this report"}"
              </strong>
              ? This action will remove the entire report document from the system.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingReport}
                onClick={() => setDeleteReportModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingReport}
                onClick={confirmDeleteReport}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 shadow-md shadow-rose-600/20 transition flex items-center gap-2"
              >
                {deletingReport ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" /> Deleting...
                  </>
                ) : (
                  "Yes, Delete Report"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}