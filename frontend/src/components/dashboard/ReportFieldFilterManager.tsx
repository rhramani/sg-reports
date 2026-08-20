import React, { useState, useMemo } from "react";
import {
  Filter,
  Plus,
  Trash2,
  X,
  SlidersHorizontal,
  Search,
  Check,
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
  matchMode: MatchMode;
  onMatchModeChange: (mode: MatchMode) => void;
  reportSearch: string;
  onReportSearchChange: (search: string) => void;
  showQuickColumnFilters: boolean;
  onToggleQuickColumnFilters: () => void;
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

/** Evaluates whether a row matches a single filter rule */
export function evaluateRowAgainstRule(
  row: Record<string, any>,
  rule: FieldFilterRule,
): boolean {
  if (!rule.field) return true;

  const rawVal =
    row[rule.field] !== undefined && row[rule.field] !== null
      ? row[rule.field]
      : row[`${rule.field} (2)`] !== undefined &&
          row[`${rule.field} (2)`] !== null
        ? row[`${rule.field} (2)`]
        : "";

  const strVal = String(rawVal).trim();
  const lowerStr = strVal.toLowerCase();

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
      return lowerStr.includes(rule.value.toLowerCase().trim());

    case "equals":
      if (!rule.value) return true;
      return lowerStr === rule.value.toLowerCase().trim();

    case "not_equals":
      if (!rule.value) return true;
      return lowerStr !== rule.value.toLowerCase().trim();

    case "starts_with":
      if (!rule.value) return true;
      return lowerStr.startsWith(rule.value.toLowerCase().trim());

    case "ends_with":
      if (!rule.value) return true;
      return lowerStr.endsWith(rule.value.toLowerCase().trim());

    case "in": {
      if (
        !rule.selectedValues ||
        rule.selectedValues.length === 0
      ) {
        if (!rule.value) return true;
        const list = rule.value
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (list.length === 0) return true;
        return list.includes(lowerStr);
      }
      return rule.selectedValues.some(
        (v) => v.trim().toLowerCase() === lowerStr,
      );
    }

    case "greater_than": {
      const num = parseNumericValue(rawVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num > target;
    }

    case "greater_than_or_equal": {
      const num = parseNumericValue(rawVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num >= target;
    }

    case "less_than": {
      const num = parseNumericValue(rawVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num < target;
    }

    case "less_than_or_equal": {
      const num = parseNumericValue(rawVal);
      const target = parseNumericValue(rule.value);
      if (num === null || target === null) return false;
      return num <= target;
    }

    case "between": {
      const num = parseNumericValue(rawVal);
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

  const cleanSearch = reportSearch.trim().toLowerCase();

  return rows.filter((row) => {
    // 1. Report-wide general search query
    if (cleanSearch) {
      const matchesSearch = Object.entries(row).some(([k, val]) => {
        if (k.startsWith("_")) return false;
        return String(val ?? "").toLowerCase().includes(cleanSearch);
      });
      if (!matchesSearch) return false;
    }

    // 2. Quick Column Filters (always AND)
    for (const [col, filterVal] of activeColFilters) {
      const q = filterVal.trim().toLowerCase();
      const rawVal =
        row[col] !== undefined && row[col] !== null
          ? row[col]
          : row[`${col} (2)`] !== undefined && row[`${col} (2)`] !== null
            ? row[`${col} (2)`]
            : "";
      if (!String(rawVal).toLowerCase().includes(q)) {
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
  matchMode,
  onMatchModeChange,
  reportSearch,
  onReportSearchChange,
  showQuickColumnFilters,
  onToggleQuickColumnFilters,
  totalRowCount,
  filteredRowCount,
  className = "",
}: ReportFieldFilterManagerProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // New Rule Drafting State
  const [draftField, setDraftField] = useState<string>(fields[0] || "");
  const [draftOperator, setDraftOperator] =
    useState<FilterOperator>("contains");
  const [draftValue, setDraftValue] = useState<string>("");
  const [draftValue2, setDraftValue2] = useState<string>("");
  const [draftSelectedValues, setDraftSelectedValues] = useState<string[]>([]);

  // Keep draftField updated if fields change and draftField is empty
  React.useEffect(() => {
    if ((!draftField || !fields.includes(draftField)) && fields.length > 0) {
      setDraftField(fields[0]);
    }
  }, [fields, draftField]);

  // When selected field changes, pick a sensible default operator
  const handleFieldChange = (newField: string) => {
    setDraftField(newField);
    setDraftValue("");
    setDraftValue2("");
    setDraftSelectedValues([]);
    if (isNumericField(newField)) {
      setDraftOperator("greater_than");
    } else {
      setDraftOperator("contains");
    }
  };

  // Extract distinct values for the selected field in this report
  const distinctFieldValues = useMemo(() => {
    if (!draftField) return [];
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const val =
        row[draftField] !== undefined && row[draftField] !== null
          ? String(row[draftField]).trim()
          : row[`${draftField} (2)`] !== undefined &&
              row[`${draftField} (2)`] !== null
            ? String(row[`${draftField} (2)`]).trim()
            : "";
      if (val && val !== "—" && val !== "-") {
        counts.set(val, (counts.get(val) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows, draftField]);

  const handleAddRule = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!draftField) return;

    if (
      draftOperator !== "empty" &&
      draftOperator !== "not_empty" &&
      draftOperator !== "between" &&
      draftOperator !== "in" &&
      !draftValue.trim()
    ) {
      return;
    }

    if (
      draftOperator === "between" &&
      !draftValue.trim() &&
      !draftValue2.trim()
    ) {
      return;
    }

    if (
      draftOperator === "in" &&
      draftSelectedValues.length === 0 &&
      !draftValue.trim()
    ) {
      return;
    }

    const newRule: FieldFilterRule = {
      id: `filter_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      field: draftField,
      operator: draftOperator,
      value: draftValue.trim(),
      value2: draftValue2.trim() || undefined,
      selectedValues:
        draftSelectedValues.length > 0 ? draftSelectedValues : undefined,
    };

    onRulesChange([...rules, newRule]);
    setDraftValue("");
    setDraftValue2("");
    setDraftSelectedValues([]);
  };

  const handleRemoveRule = (id: string) => {
    onRulesChange(rules.filter((r) => r.id !== id));
  };

  const handleClearAll = () => {
    onRulesChange([]);
    onReportSearchChange("");
  };

  const activeRuleCount = rules.length;
  const isFiltered = activeRuleCount > 0 || Boolean(reportSearch.trim());

  const getOperatorLabel = (op: FilterOperator) => {
    switch (op) {
      case "contains":
        return "Contains";
      case "equals":
        return "Equals (=)";
      case "not_equals":
        return "Does Not Equal (≠)";
      case "starts_with":
        return "Starts with";
      case "ends_with":
        return "Ends with";
      case "greater_than":
        return "Greater than (>)";
      case "greater_than_or_equal":
        return "Greater or Equal (≥)";
      case "less_than":
        return "Less than (<)";
      case "less_than_or_equal":
        return "Less or Equal (≤)";
      case "between":
        return "Between Range";
      case "empty":
        return "Is Empty / Blank";
      case "not_empty":
        return "Is Not Empty";
      case "in":
        return "In Selected Values";
      default:
        return op;
    }
  };

  return (
    <div
      className={`border-b border-slate-200/90 bg-slate-50/70 p-3 sm:px-5 transition-all ${className}`}
    >
      {/* ── Top Bar: Search, Filter Toggle, Column Filter Toggle, Counts ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          {/* Quick Search within this Report */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={reportSearch}
              onChange={(e) => onReportSearchChange(e.target.value)}
              placeholder="Search across all fields in report..."
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-[#18476A] focus:ring-1 focus:ring-[#18476A]/20 transition"
            />
            {reportSearch && (
              <button
                type="button"
                onClick={() => onReportSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

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
                ? "border-sky-400 bg-sky-50 text-sky-800"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
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

          {rules.map((rule) => {
            let valDisplay = rule.value;
            if (rule.operator === "between") {
              valDisplay = `${rule.value || "Min"} — ${rule.value2 || "Max"}`;
            } else if (rule.operator === "empty") {
              valDisplay = "Blank / Empty";
            } else if (rule.operator === "not_empty") {
              valDisplay = "Not Empty";
            } else if (rule.operator === "in") {
              valDisplay =
                rule.selectedValues && rule.selectedValues.length > 0
                  ? rule.selectedValues.join(", ")
                  : rule.value;
            }

            return (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#18476A]/30 px-2.5 py-1 text-xs font-medium text-slate-800 shadow-2xs hover:border-[#18476A] transition"
              >
                <strong className="text-[#18476A] font-bold">
                  {rule.field}
                </strong>
                <span className="text-[11px] text-slate-400 font-sans">
                  {getOperatorLabel(rule.operator).toLowerCase()}
                </span>
                <span className="font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded text-[11px]">
                  {valDisplay}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveRule(rule.id)}
                  className="text-slate-400 hover:text-rose-600 transition p-0.5 rounded hover:bg-rose-50"
                  title="Remove this filter"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
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

            {/* Match Mode Selector (AND / OR) */}
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="text-[11px] text-slate-400 font-bold uppercase">
                Match:
              </span>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => onMatchModeChange("all")}
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-md transition ${
                    matchMode === "all"
                      ? "bg-[#18476A] text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ALL Rules (AND)
                </button>
                <button
                  type="button"
                  onClick={() => onMatchModeChange("any")}
                  className={`px-2.5 py-0.5 text-xs font-bold rounded-md transition ${
                    matchMode === "any"
                      ? "bg-[#18476A] text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ANY Rule (OR)
                </button>
              </div>
            </div>
          </div>

          {/* Add New Filter Rule Form */}
          <form
            onSubmit={handleAddRule}
            className="flex flex-wrap items-end gap-2.5 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80"
          >
            {/* 1. Field Dropdown */}
            <div className="flex flex-col gap-1 min-w-[150px] flex-1">
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

            {/* 2. Operator Dropdown */}
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Condition
              </label>
              <select
                value={draftOperator}
                onChange={(e) =>
                  setDraftOperator(e.target.value as FilterOperator)
                }
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#18476A] transition"
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals (Exact)</option>
                <option value="not_equals">Does Not Equal</option>
                <option value="starts_with">Starts With</option>
                <option value="ends_with">Ends With</option>
                <option value="greater_than">Greater Than (&gt;)</option>
                <option value="greater_than_or_equal">
                  Greater or Equal (&ge;)
                </option>
                <option value="less_than">Less Than (&lt;)</option>
                <option value="less_than_or_equal">Less or Equal (&le;)</option>
                <option value="between">Between Range (Min - Max)</option>
                <option value="empty">Is Empty / Blank</option>
                <option value="not_empty">Is Not Empty</option>
                {distinctFieldValues.length > 0 && (
                  <option value="in">In Values List</option>
                )}
              </select>
            </div>

            {/* 3. Filter Value Input(s) */}
            {draftOperator === "empty" || draftOperator === "not_empty" ? (
              <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                  Value
                </label>
                <div className="h-8 flex items-center px-3 text-xs text-slate-400 italic bg-slate-100 rounded-lg border border-slate-200">
                  No value needed for this condition
                </div>
              </div>
            ) : draftOperator === "between" ? (
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Min Value
                  </label>
                  <input
                    type="text"
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    placeholder="Min"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-[#18476A] transition"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Max Value
                  </label>
                  <input
                    type="text"
                    value={draftValue2}
                    onChange={(e) => setDraftValue2(e.target.value)}
                    placeholder="Max"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-[#18476A] transition"
                  />
                </div>
              </div>
            ) : draftOperator === "in" ? (
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  Select Values ({distinctFieldValues.length} available)
                </label>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                  {distinctFieldValues.map(({ value, count }) => {
                    const isSelected = draftSelectedValues.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setDraftSelectedValues(
                              draftSelectedValues.filter((v) => v !== value),
                            );
                          } else {
                            setDraftSelectedValues([
                              ...draftSelectedValues,
                              value,
                            ]);
                          }
                        }}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                          isSelected
                            ? "bg-[#18476A] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {isSelected && <Check size={10} />}
                        <span>{value}</span>
                        <span className="text-[9px] opacity-75">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <div className="flex items-center justify-between">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    Filter Value
                  </label>
                  {distinctFieldValues.length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      Suggestions available
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    list={`suggestions-${draftField}`}
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    placeholder={`Enter value for ${draftField}...`}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-[#18476A] transition"
                  />
                  {distinctFieldValues.length > 0 && (
                    <datalist id={`suggestions-${draftField}`}>
                      {distinctFieldValues.slice(0, 30).map(({ value }) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  )}
                </div>
              </div>
            )}

            {/* 4. Add Button */}
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#18476A] px-4 text-xs font-bold text-white shadow-md hover:bg-[#123955] transition cursor-pointer shrink-0"
            >
              <Plus size={14} />
              Add Filter
            </button>
          </form>

          {/* Quick Suggestions for Selected Field */}
          {distinctFieldValues.length > 0 &&
            draftOperator !== "in" &&
            draftOperator !== "empty" &&
            draftOperator !== "not_empty" && (
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  Quick Values:
                </span>
                {distinctFieldValues.slice(0, 8).map(({ value, count }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setDraftValue(value);
                      setDraftOperator("equals");
                    }}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition cursor-pointer"
                  >
                    <span>{value}</span>
                    <span className="text-[9.5px] text-slate-400">({count})</span>
                  </button>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
