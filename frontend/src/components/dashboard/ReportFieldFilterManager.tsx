import React, { useState, useMemo } from "react";
import {
  Filter,
  Plus,
  X,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type FilterOperator =
  | "contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "between"
  | "empty"
  | "not_empty"
  | "in";

export interface FieldFilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  value2?: string; // For between/range
  selectedValues?: string[]; // For multi-select
}

export type MatchMode = "all" | "any";

export interface ReportFieldFilterManagerProps {
  fields: string[];
  rows: Record<string, any>[];
  rules: FieldFilterRule[];
  onRulesChange: (rules: FieldFilterRule[]) => void;
  matchMode?: MatchMode;
  onMatchModeChange?: (mode: MatchMode) => void;
  reportSearch?: string;
  onReportSearchChange?: (search: string) => void;
  showQuickColumnFilters: boolean;
  onToggleQuickColumnFilters: () => void;
  quickColumnFilters?: Record<string, string>;
  onResetQuickColumnFilters?: () => void;
  totalRowCount: number;
  filteredRowCount: number;
  className?: string;
}

/** Helper to clean & parse numbers from strings */
export function parseNumericValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).replace(/,/g, "").trim();
  if (!str || str === "—" || str === "-") return null;
  const num = parseFloat(str.replace(/[^0-9.-]+/g, ""));
  return isNaN(num) ? null : num;
}

/** Check if column is likely numeric/weight/amount */
export function isNumericField(fieldName: string): boolean {
  return /pieces|weight|wt|fine|amt|amount|price|credit|debit|rate|touch|qty|balance|total|pure/i.test(
    fieldName,
  );
}

/** Check if column is likely date */
export function isDateField(fieldName: string): boolean {
  return /date|time|day|dt/i.test(fieldName);
}

/** Resolves the field value from a row flexibly taking aliases, trimmed keys, duplicate numbers into account */
export function getResolvedFieldValue(
  row: Record<string, any>,
  targetField: string,
): string {
  if (!row || !targetField) return "";

  // 1. Direct key lookup
  if (row[targetField] !== undefined && row[targetField] !== null) {
    return String(row[targetField]).trim();
  }

  const cleanTarget = targetField
    .replace(/\s*\(\d+\)$/, "")
    .trim()
    .toLowerCase();

  // 2. Lookup by case-insensitive key or trimmed key or suffix-stripped key
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_")) continue;
    if (v === null || v === undefined) continue;

    const lowerK = k.trim().toLowerCase();
    if (lowerK === targetField.trim().toLowerCase()) {
      return String(v).trim();
    }

    const cleanK = lowerK.replace(/\s*\(\d+\)$/, "").trim();
    if (cleanK === cleanTarget) {
      return String(v).trim();
    }
  }

  // 3. Computed / fallback columns
  if (/^touch$|^tch$/i.test(cleanTarget)) {
    const pure = parseNumericValue(
      row["Pure Weight"] ??
        row["Pure Weight (2)"] ??
        row["Fine Wt"] ??
        row["Fine Wt (2)"] ??
        row["Pure Wt"] ??
        row["Fine Weight"],
    );
    const net = parseNumericValue(
      row["Net Weight"] ??
        row["Net Weight (2)"] ??
        row["Gross Wt"] ??
        row["Gross Wt (2)"] ??
        row["Weight"],
    );
    if (pure !== null && net !== null && net > 0) {
      const calc = (pure / net) * 100;
      return calc.toFixed(2);
    }
  }

  if (/^purity$/i.test(cleanTarget)) {
    const p = row["Purity"] ?? row["Purity (2)"] ?? row["Purity%"];
    if (p !== undefined && p !== null) return String(p).trim();
  }

  return "";
}

/** Check if a cell string or numeric value matches the search query */
export function matchFilterQuery(cellValue: unknown, query: string): boolean {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;

  const rawVal =
    cellValue !== undefined && cellValue !== null
      ? String(cellValue).trim()
      : "";
  const lowerVal = rawVal.toLowerCase();

  // 1. Direct substring match
  if (lowerVal.includes(q)) return true;

  // 2. Remove commas (e.g. searching "1250" in "1,250.00" or searching "1,250" in "1250")
  const cleanQ = q.replace(/,/g, "").trim();
  const cleanVal = lowerVal.replace(/,/g, "").trim();
  if (cleanQ && cleanVal.includes(cleanQ)) return true;

  // 3. Comma-separated query values (e.g. "RAJ, SURAT" or "Gold, Silver"), only if not a pure number with commas
  const isPureNumberWithCommas = /^[\d,.\s-]+$/.test(q);
  if (!isPureNumberWithCommas && q.includes(",")) {
    const parts = q
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (
      parts.length > 0 &&
      parts.some(
        (p) => lowerVal.includes(p) || cleanVal.includes(p.replace(/,/g, "")),
      )
    ) {
      return true;
    }
  }

  // 4. Numeric equivalence / decimal comparison
  const numVal = parseNumericValue(rawVal);
  const numQ = parseNumericValue(q);
  if (numVal !== null && numQ !== null) {
    if (numVal === numQ) return true;
    if (
      numVal.toFixed(2) === numQ.toFixed(2) ||
      numVal.toFixed(3) === numQ.toFixed(3)
    ) {
      return true;
    }
    const numValStr = numVal.toString();
    const numQStr = numQ.toString();
    if (numValStr === numQStr) return true;
  }

  return false;
}

/** Evaluates whether a row matches a single filter rule */
export function evaluateRowAgainstRule(
  row: Record<string, any>,
  rule: FieldFilterRule,
): boolean {
  if (!rule.field) return true;

  const strVal = getResolvedFieldValue(row, rule.field);
  const lowerStr = strVal.toLowerCase();
  const cleanVal = lowerStr.replace(/,/g, "");
  const ruleVal = (rule.value || "").trim().toLowerCase();
  const cleanRuleVal = ruleVal.replace(/,/g, "");

  switch (rule.operator) {
    case "empty":
      return (
        !strVal ||
        strVal === "—" ||
        strVal === "-" ||
        lowerStr === "null" ||
        lowerStr === "undefined"
      );

    case "not_empty":
      return (
        Boolean(strVal) &&
        strVal !== "—" &&
        strVal !== "-" &&
        lowerStr !== "null" &&
        lowerStr !== "undefined"
      );

    case "contains":
      if (!rule.value) return true;
      return matchFilterQuery(strVal, rule.value);

    case "equals":
      if (!rule.value) return true;
      return lowerStr === ruleVal || cleanVal === cleanRuleVal;

    case "not_equals":
      if (!rule.value) return true;
      return lowerStr !== ruleVal && cleanVal !== cleanRuleVal;

    case "starts_with":
      if (!rule.value) return true;
      return lowerStr.startsWith(ruleVal) || cleanVal.startsWith(cleanRuleVal);

    case "ends_with":
      if (!rule.value) return true;
      return lowerStr.endsWith(ruleVal) || cleanVal.endsWith(cleanRuleVal);

    case "in": {
      if (!rule.selectedValues || rule.selectedValues.length === 0) {
        if (!rule.value) return true;
        const list = rule.value
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (list.length === 0) return true;
        return list.includes(lowerStr) || list.includes(cleanVal);
      }
      return rule.selectedValues.some((v) => {
        const lv = v.trim().toLowerCase();
        return lv === lowerStr || lv === cleanVal;
      });
    }

    case "greater_than": {
      const num = parseNumericValue(strVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num > target;
    }

    case "greater_than_or_equal": {
      const num = parseNumericValue(strVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num >= target;
    }

    case "less_than": {
      const num = parseNumericValue(strVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num < target;
    }

    case "less_than_or_equal": {
      const num = parseNumericValue(strVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num <= target;
    }

    case "between": {
      const num = parseNumericValue(strVal);
      const min = parseNumericValue(rule.value);
      const max = parseNumericValue(rule.value2);
      if (num === null) return false;
      if (min !== null && max !== null) return num >= min && num <= max;
      if (min !== null) return num >= min;
      if (max !== null) return num <= max;
      return true;
    }

    default:
      return true;
  }
}

/** Check if row passes all active field rules and column filters */
export function filterRowsWithRules(
  rows: Record<string, any>[],
  rules: FieldFilterRule[],
  matchMode: MatchMode = "all",
  quickColumnFilters: Record<string, string> = {},
  reportSearch: string = "",
): Record<string, any>[] {
  const activeRules = rules.filter(
    (r) =>
      r.field &&
      (r.operator === "empty" ||
        r.operator === "not_empty" ||
        (r.operator === "between" && (r.value || r.value2)) ||
        (r.operator === "in" &&
          ((r.selectedValues && r.selectedValues.length > 0) || r.value)) ||
        r.value),
  );

  const activeColFilters = Object.entries(quickColumnFilters).filter(
    ([, val]) => val && val.trim(),
  );

  const cleanSearch = reportSearch ? reportSearch.trim().toLowerCase() : "";

  return rows.filter((row) => {
    // 1. Report-wide general search query (if any)
    if (cleanSearch) {
      const matchesSearch = Object.entries(row).some(([k, val]) => {
        if (k.startsWith("_")) return false;
        return matchFilterQuery(String(val ?? ""), cleanSearch);
      });
      if (!matchesSearch) return false;
    }

    // 2. Quick Column Filters (always AND)
    for (const [col, filterVal] of activeColFilters) {
      const cellVal = getResolvedFieldValue(row, col);
      if (!matchFilterQuery(cellVal, filterVal)) {
        return false;
      }
    }

    // 3. Field Filter Rules
    if (activeRules.length === 0) return true;

    if (matchMode === "all") {
      return activeRules.every((rule) => evaluateRowAgainstRule(row, rule));
    } else {
      return activeRules.some((rule) => evaluateRowAgainstRule(row, rule));
    }
  });
}

export function ReportFieldFilterManager({
  fields,
  rows,
  rules,
  onRulesChange,
  matchMode = "all",
  onMatchModeChange,
  reportSearch = "",
  onReportSearchChange,
  showQuickColumnFilters,
  onToggleQuickColumnFilters,
  quickColumnFilters = {},
  onResetQuickColumnFilters,
  totalRowCount,
  filteredRowCount,
  className = "",
}: ReportFieldFilterManagerProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // New Rule Drafting State
  const [draftField, setDraftField] = useState<string>(fields[0] || "");
  const [draftValue, setDraftValue] = useState<string>("");

  // Keep draftField updated if fields change and draftField is empty
  React.useEffect(() => {
    if ((!draftField || !fields.includes(draftField)) && fields.length > 0) {
      setDraftField(fields[0]);
    }
  }, [fields, draftField]);

  // When selected field changes, reset draft value
  const handleFieldChange = (newField: string) => {
    setDraftField(newField);
    setDraftValue("");
  };

  const handleAddRule = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!draftField || !draftValue.trim()) return;

    const newRule: FieldFilterRule = {
      id: `filter_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      field: draftField,
      operator: "contains",
      value: draftValue.trim(),
    };

    onRulesChange([...rules, newRule]);
    setDraftValue("");
  };

  const handleRemoveRule = (id: string) => {
    onRulesChange(rules.filter((r) => r.id !== id));
  };

  const handleClearAll = () => {
    onRulesChange([]);
    if (onReportSearchChange) onReportSearchChange("");
    if (onResetQuickColumnFilters) onResetQuickColumnFilters();
  };

  const activeRuleCount = rules.length;
  const hasActiveQuickFilters = Object.values(quickColumnFilters || {}).some(
    (v) => v && v.trim(),
  );
  const isFiltered =
    activeRuleCount > 0 ||
    hasActiveQuickFilters ||
    Boolean(reportSearch?.trim());

  return (
    <div
      className={`border-b border-slate-200/90 bg-slate-50/70 p-3 sm:px-5 transition-all ${className}`}
    >
      {/* ── Top Bar: Filter Fields Toggle, Column Search Toggle, Reset, Counts ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Manage Field Filters Button */}
          <button
            type="button"
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition shadow-2xs cursor-pointer ${
              activeRuleCount > 0 || isPanelOpen
                ? "border-[#18476A] bg-[#18476A] text-white hover:bg-[#123955]"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400"
            }`}
            title="Manage dynamic field filters for this report"
          >
            <SlidersHorizontal size={13} />
            <span>Filter Fields</span>
            {activeRuleCount > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                  isPanelOpen || activeRuleCount > 0
                    ? "bg-amber-400 text-slate-950"
                    : "bg-[#18476A] text-white"
                }`}
              >
                {activeRuleCount}
              </span>
            )}
            {isPanelOpen ? (
              <ChevronUp size={13} />
            ) : (
              <ChevronDown size={13} />
            )}
          </button>

          {/* Toggle Quick Column Search Inputs */}
          <button
            type="button"
            onClick={onToggleQuickColumnFilters}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition shadow-2xs cursor-pointer ${
              showQuickColumnFilters
                ? "border-sky-500 bg-sky-50 text-sky-800 font-bold"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400"
            }`}
            title="Toggle column-by-column search inputs in table header"
          >
            <Filter size={12} />
            <span>Column Search</span>
          </button>

          {/* Clear All Filters Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition cursor-pointer"
              title="Reset all filters for this report"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Real-time Row Match Count Feedback */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
              isFiltered
                ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                : "bg-slate-200/80 text-slate-700"
            }`}
          >
            {filteredRowCount} of {totalRowCount} entries
          </span>
          {isFiltered && (
            <span className="text-[11px] text-amber-700 font-medium hidden sm:inline">
              ({totalRowCount - filteredRowCount} filtered out)
            </span>
          )}
        </div>
      </div>

      {/* ── Active Filter Chips Row ── */}
      {activeRuleCount > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/60">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Sparkles size={11} className="text-amber-500" /> Active Filters:
          </span>

          {rules.map((rule) => (
            <span
              key={rule.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#18476A]/30 px-2.5 py-1 text-xs font-medium text-slate-800 shadow-2xs hover:border-[#18476A] transition"
            >
              <strong className="text-[#18476A] font-bold">
                {rule.field}:
              </strong>
              <span className="font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded text-[11px]">
                {rule.value}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveRule(rule.id)}
                className="text-slate-400 hover:text-rose-600 transition p-0.5 rounded hover:bg-rose-50 cursor-pointer"
                title="Remove this filter"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Collapsible Filter Builder Panel ── */}
      {isPanelOpen && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-md animate-in fade-in zoom-in-95">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-[#18476A]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Manage Dynamic Field Filters ({fields.length} Fields Available)
              </h4>
            </div>
          </div>

          {/* Add New Filter Rule Form */}
          <form
            onSubmit={handleAddRule}
            className="flex flex-wrap items-end gap-2.5 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80"
          >
            {/* 1. Field Dropdown */}
            <div className="flex flex-col gap-1 min-w-[180px] flex-1">
              <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Select Field
              </label>
              <select
                value={draftField}
                onChange={(e) => handleFieldChange(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#18476A] transition"
              >
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Filter Value Input */}
            <div className="flex flex-col gap-1 flex-2 min-w-[220px]">
              <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Filter Value
              </label>
              <input
                type="text"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                placeholder={`Enter value for ${draftField}...`}
                autoComplete="off"
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-[#18476A] focus:ring-1 focus:ring-[#18476A]/20 transition"
              />
            </div>

            {/* 3. Add Button */}
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#18476A] px-4 text-xs font-bold text-white shadow-md hover:bg-[#123955] transition cursor-pointer shrink-0"
            >
              <Plus size={14} />
              Add Filter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
