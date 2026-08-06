import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  LayoutGrid,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { authFetch, getAuthUser } from "@/lib/apiClient";
import type { PermissionActions, ReportItem } from "@shared/api";

interface LedgerPaneProps {
  title: string;
  tone: "debit" | "credit";
  rows: { row: Record<string, string>; index: number; group: string }[];
  columns: string[];
  transactionKey: string;
  typeKey: string;
  amountKey: string;
  numericKeys: string[];
  selected: number[];
  toggleApproval: (index: number) => void;
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
}: LedgerPaneProps) {
  const isDebit = tone === "debit";

  return (
    <div
      className={`min-w-[520px] flex-1 ${
        isDebit ? "border-r border-[#c8b3a7] bg-[#faf5f2]" : "bg-[#f3f8f7]"
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-4 py-3 ${
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
          {rows.length} rows
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-black/10 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
            <th className="w-12 px-3 py-2">Check</th>
            {columns
              .filter(
                (column) =>
                  column !== amountKey && !numericKeys.includes(column),
              )
              .map((column) => (
                <th key={column} className="px-3 py-2">
                  {column}
                </th>
              ))}
            {numericKeys.map((nk) => (
              <th key={nk} className="w-28 px-3 py-2 text-right">
                {nk}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, index, group }) => {
            const isApproved = selected.includes(index);
            const user = getAuthUser();
            const currentUserName =
              user?.name || user?.email?.split("@")[0] || "BHAVESH";

            return (
              <tr
                key={`${group}-${index}`}
                className={`border-b border-black/5 transition ${
                  isApproved
                    ? "bg-[#d3efe6] hover:bg-[#c4ebd3]"
                    : "hover:bg-white/60"
                }`}
              >
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => toggleApproval(index)}
                      className={`grid h-5 w-5 place-items-center rounded border transition ${
                        isApproved
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                      }`}
                    >
                      <Check size={13} strokeWidth={3} />
                    </button>
                    {isApproved && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap">
                        By - {currentUserName}
                      </span>
                    )}
                  </div>
                </td>
                {columns
                  .filter(
                    (column) =>
                      column !== amountKey && !numericKeys.includes(column),
                  )
                  .map((column) => (
                    <td key={column} className="px-3 py-3 align-top">
                      <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                        {column}
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-700">
                        {column === transactionKey
                          ? row[column] || group || "—"
                          : row[column] || "—"}
                        {isApproved && column === typeKey && (
                          <span className="ml-1 text-[9px] font-bold text-emerald-700">
                            ✔ By - {currentUserName}
                          </span>
                        )}
                      </span>
                    </td>
                  ))}
                {numericKeys.map((nk) => (
                  <td
                    key={nk}
                    className={`px-3 py-3 text-right align-top text-[11px] font-bold ${
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
  rows: Record<string, string>[];
  columns: string[];
  transactionKey: string;
  typeKey: string;
  amountKey: string;
  selected: number[];
  toggleApproval: (index: number) => void;
  toast: (message: string) => void;
  activeReportName?: string;
}

function LedgerTableView({
  rows,
  columns,
  transactionKey,
  typeKey,
  amountKey,
  selected,
  toggleApproval,
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

  // Identify all numeric keys in the rows (e.g. Gr. Wt., Net Wt., Fine, Amt, Credit, Debit)
  const numericKeys = columns.filter((col) => {
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

  let currentGroup = "";
  const entries = rows.map((row, index) => {
    const value =
      row["Book Name"] ||
      row["BookHeadName"] ||
      row[transactionKey]?.trim() ||
      "";
    if (value && !/total/i.test(value)) currentGroup = value;
    return { row, index, group: currentGroup };
  });

  const debit = entries.filter(({ row }) => {
    if (row["Debit"] && parseAmt(row["Debit"]) > 0) return true;
    if (
      row["Credit"] &&
      parseAmt(row["Credit"]) === 0 &&
      parseAmt(row["Debit"]) > 0
    )
      return true;
    if (row["Type"] && /debit|\[01\]/i.test(row["Type"])) return true;
    if (row["InOut"] && /in|receive/i.test(row["InOut"])) return true;
    if (typeKey && row[typeKey] && /debit|receipt|in|plus/i.test(row[typeKey]))
      return true;
    return false;
  });

  const credit = entries.filter(({ row }) => {
    if (row["Credit"] && parseAmt(row["Credit"]) > 0) return true;
    if (
      row["Debit"] &&
      parseAmt(row["Debit"]) === 0 &&
      parseAmt(row["Credit"]) > 0
    )
      return true;
    if (row["Type"] && /credit|\[02\]/i.test(row["Type"])) return true;
    if (row["InOut"] && /out|issue/i.test(row["InOut"])) return true;
    if (
      typeKey &&
      row[typeKey] &&
      /credit|issue|payment|out|minus/i.test(row[typeKey])
    )
      return true;
    return false;
  });

  // Fallback split if unassigned
  const unassigned = entries.filter(
    (e) => !debit.includes(e) && !credit.includes(e),
  );
  if (unassigned.length > 0) {
    unassigned.forEach((e, idx) => {
      if (idx % 2 === 0) debit.push(e);
      else credit.push(e);
    });
  }

  const primaryKey =
    primaryNumericKeys[primaryNumericKeys.length - 1] || amountKey || "Amt.";
  const isWeight = /wt|weight|fine/i.test(primaryKey);

  let debitVerified = 0;
  let debitUnverified = 0;
  debit.forEach(({ row, index }) => {
    const amt = parseAmt(row[primaryKey] || row["Amount"] || row["Debit"]);
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
    const amt = parseAmt(row[primaryKey] || row["Amount"] || row["Credit"]);
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
            title="Debit report"
            tone="debit"
            rows={debit}
            columns={columns}
            transactionKey={transactionKey}
            typeKey={typeKey}
            amountKey={amountKey}
            numericKeys={primaryNumericKeys}
            selected={selected}
            toggleApproval={toggleApproval}
          />
          <LedgerPane
            title="Credit report"
            tone="credit"
            rows={credit}
            columns={columns}
            transactionKey={transactionKey}
            typeKey={typeKey}
            amountKey={amountKey}
            numericKeys={primaryNumericKeys}
            selected={selected}
            toggleApproval={toggleApproval}
          />
        </div>

        {/* Dynamic Ledger Summary Footer */}
        <div className="border-t border-[#c8b3a7] bg-white text-xs">
          {/* Row 1: Verify / Unverify / Sub Total */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7] border-b border-slate-200">
            {/* Debit Side */}
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
            {/* Credit Side */}
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
          </div>

          {/* Row 2: Total Receipt / Total Issue */}
          <div className="grid grid-cols-2 divide-x divide-[#c8b3a7] border-b border-slate-200">
            {/* Debit Side Total Receipt */}
            <div className="grid grid-cols-4 items-center px-2 py-2">
              <div className="col-span-3 text-right font-bold text-slate-800 pr-2">
                Total Receipt
              </div>
              <div className="text-right font-bold text-slate-900 pr-2">
                {formatNum(debitSubTotal, isWeight)}
              </div>
            </div>
            {/* Credit Side Total Issue */}
            <div className="grid grid-cols-4 items-center px-2 py-2">
              <div className="col-span-3 text-right font-bold text-slate-800 pr-2">
                Total Issue
              </div>
              <div className="text-right font-bold text-slate-900 pr-2">
                {formatNum(creditSubTotal, isWeight)}
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
  setQuery: (value: string) => void;
  permissions?: PermissionActions;
}) {
  type ReportRow = Record<string, string>;

  // ── References & Data States ────────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);

  const [savedReports, setSavedReports] = useState<ReportItem[]>([]);
  const [reportTypesCatalog, setReportTypesCatalog] = useState<string[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string>("");

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reportId, setReportId] = useState("");
  const [activeReportMeta, setActiveReportMeta] = useState<ReportItem | null>(
    null,
  );

  // ── View Mode & Filters ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<
    "auto" | "ledger" | "grid" | "analytics"
  >("auto");
  const [reportTypeFilter, setReportTypeFilter] = useState("All");
  const [reportStatusFilter, setReportStatusFilter] = useState("All");
  const [reportSearchQuery, setReportSearchQuery] = useState("");

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
  const [selectedDateCol, setSelectedDateCol] = useState<string>("");

  // Row-level column filter
  const [filterColumn, setFilterColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<
    "all" | "approved" | "pending"
  >("all");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState("");

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  };

  // ── Fetch saved reports and report types on mount ───────────────────────────
  const loadSavedReports = async () => {
    setLoadingReports(true);
    try {
      // 1. Fetch report types
      const typesRes = await authFetch("/api/report-types");
      if (typesRes.ok) {
        const typesData = await typesRes.json();
        if (typesData.success && Array.isArray(typesData.data)) {
          const typeNames = typesData.data.map((t: { name: string }) => t.name);
          setReportTypesCatalog(typeNames);
        }
      }

      // 2. Fetch reports
      const res = await authFetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setSavedReports(data.data);
          // If no report currently selected, auto select the first available report
          if (data.data.length > 0 && !selectedReportId) {
            selectReport(data.data[0]);
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
    loadSavedReports();
  }, []);

  // ── Load selected report details ───────────────────────────────────────────
  const selectReport = async (report: ReportItem) => {
    const id = report._id || report.reportId || "";
    setSelectedReportId(id);
    setReportId(report.reportId || id);
    setFileName(report.name);
    setActiveReportMeta(report);
    setSelected([]);

    if (report.data && Array.isArray(report.data) && report.data.length > 0) {
      const sanitized = report.data.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, String(v ?? "")]),
        ),
      );
      setRows(sanitized);

      // Auto-detect status column (e.g., CASH REPORT.xlsx "Status" = "Checked")
      const preSelected: number[] = [];
      sanitized.forEach((row, idx) => {
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
          preSelected.push(idx);
        }
      });
      setSelected(preSelected);
    } else {
      // Fetch full report if data was omitted in list
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
              (row: Record<string, unknown>) =>
                Object.fromEntries(
                  Object.entries(row).map(([k, v]) => [k, String(v ?? "")]),
                ),
            );
            setRows(sanitized);

            const preSelected: number[] = [];
            sanitized.forEach((row: Record<string, string>, idx: number) => {
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
                preSelected.push(idx);
              }
            });
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
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });
    const headerIndex = matrix.slice(0, 30).reduce(
      (best, row, index) => {
        const nonEmptyCount = row.filter(
          (value) => String(value).trim() !== "",
        ).length;
        return nonEmptyCount > best.count
          ? { index, count: nonEmptyCount }
          : best;
      },
      { index: 0, count: 0 },
    ).index;
    const headerCounts = new Map<string, number>();
    const headers = (matrix[headerIndex] ?? []).map((value, index) => {
      const base = String(value).trim() || `Column ${index + 1}`;
      const count = (headerCounts.get(base) ?? 0) + 1;
      headerCounts.set(base, count);
      return count === 1 ? base : `${base} (${count})`;
    });
    const parsed = matrix
      .slice(headerIndex + 1)
      .filter((row) => row.some((value) => String(value).trim() !== ""))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, String(row[index] ?? "")]),
        ),
      );
    return { headers, parsed };
  };

  const applyWorkbook = async (buffer: ArrayBuffer, name: string) => {
    const { headers, parsed } = parseWorkbook(buffer);
    if (!headers.length || !parsed.length) {
      toast("No tabular data found in the first sheet");
      return;
    }

    const cleanName = name.replace(/\.[^/.]+$/, "");
    setRows(parsed);
    setFileName(cleanName);
    setSelectedReportId("new_upload");

    // Auto-detect status column from uploaded file
    const preSelected: number[] = [];
    parsed.forEach((row, idx) => {
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
          data: parsed.slice(0, 500),
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setReportId(data.data.reportId || data.data._id || "");
        setActiveReportMeta(data.data);
        backendMsg = `Report "${cleanName}" uploaded and saved to backend!`;
        // Refresh saved reports list
        loadSavedReports();
      }
    } catch {
      // Graceful fallback
    }

    toast(backendMsg);
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    applyWorkbook(await file.arrayBuffer(), file.name);
  };

  // ── Column & Key Detections ──────────────────────────────────────────────────
  const columns = rows.length
    ? Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    : [];

  const parseCellDate = (val: any): Date | null => {
    if (val === null || val === undefined || val === "") return null;

    // Excel serial numbers
    if (
      typeof val === "number" ||
      (!isNaN(Number(val)) &&
        !String(val).includes("-") &&
        !String(val).includes("/") &&
        !String(val).includes("."))
    ) {
      const num = Number(val);
      if (num > 25000 && num < 60000) {
        const date = new Date(Math.round((num - (25567 + 2)) * 86400 * 1000));
        if (!isNaN(date.getTime())) return date;
      }
    }

    const str = String(val).trim();
    if (!str) return null;

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }

    // YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed;

    return null;
  };

  // Detect candidate date columns in dataset dynamically
  const dateColumns = columns.filter((col) => {
    if (
      /date|dt|time|day|period|created|voucher_date|vou_date|tr_date|trans_date/i.test(
        col,
      )
    ) {
      return true;
    }
    const sample = rows.slice(0, 15);
    if (!sample.length) return false;
    const dateCount = sample.filter(
      (r) => parseCellDate(r[col]) !== null,
    ).length;
    return dateCount >= Math.min(sample.length * 0.4, 3);
  });

  const activeDateColumn =
    selectedDateCol && columns.includes(selectedDateCol)
      ? selectedDateCol
      : dateColumns[0] || "";

  const transactionKey =
    columns.find((column) =>
      /transaction|voucher|entry|reference|document|journal|vou\.?no/i.test(
        column,
      ),
    ) ||
    columns[0] ||
    "Vou.No";

  const typeKey =
    columns.find((column) =>
      /type|category|nature|dr.?cr|credit.?debit|p\.?type|inout/i.test(column),
    ) || "P.Type";

  const amountKey =
    columns.find((column) =>
      /amount|amt|total|value|balance|price|cost|credit|debit|net weight|pure weight/i.test(
        column,
      ),
    ) || "Amt.";

  const isGroupedLedger = Boolean(
    rows.length > 0 &&
    (columns.some((c) =>
      /credit|debit|particular|party|vou|voucher|p\.type|type|net weight|pure weight/i.test(
        c,
      ),
    ) ||
      rows.some((row) =>
        Object.values(row).some((val) =>
          /credit|debit|receipt|payment|issue|receive/i.test(String(val)),
        ),
      )),
  );

  const effectiveViewMode =
    viewMode === "auto" ? (isGroupedLedger ? "ledger" : "grid") : viewMode;

  // ── Filtering Logic ────────────────────────────────────────────────────────
  // 1. Report-wise filtering for selector
  const availableReportTypes = Array.from(
    new Set([...reportTypesCatalog, ...savedReports.map((r) => r.type)]),
  );

  const filteredReportsList = savedReports.filter((report) => {
    if (reportTypeFilter !== "All" && report.type !== reportTypeFilter)
      return false;
    if (reportStatusFilter !== "All" && report.status !== reportStatusFilter)
      return false;
    if (
      reportSearchQuery.trim() &&
      !report.name.toLowerCase().includes(reportSearchQuery.toLowerCase()) &&
      !report.owner.toLowerCase().includes(reportSearchQuery.toLowerCase())
    ) {
      return false;
    }
    // Filter reports by creation/added date
    if (startDate || endDate) {
      const repDate = report.createdAt ? parseCellDate(report.createdAt) : null;
      if (repDate && !isNaN(repDate.getTime())) {
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (repDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (repDate < end) return false;
        }
      }
    }
    return true;
  });

  // 2. Row-level filtering for active dataset (including dynamic date range)
  const filteredRows = rows.filter((row, idx) => {
    // Global search query
    if (query.trim()) {
      const q = query.toLowerCase();
      const matchesQuery = Object.values(row).some((val) =>
        String(val).toLowerCase().includes(q),
      );
      if (!matchesQuery) return false;
    }

    // Dynamic Date Range Filter
    if (activeDateColumn && (startDate || endDate)) {
      const rowDate = parseCellDate(row[activeDateColumn]);
      if (!rowDate) return false;
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (rowDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (rowDate > end) return false;
      }
    }

    // Column filter
    if (filterColumn && filterValue.trim()) {
      const cellVal = String(row[filterColumn] ?? "").toLowerCase();
      if (!cellVal.includes(filterValue.toLowerCase())) return false;
    }

    // Approval status filter
    if (approvalFilter === "approved" && !selected.includes(idx)) return false;
    if (approvalFilter === "pending" && selected.includes(idx)) return false;

    return true;
  });

  // ── Handlers & Actions ─────────────────────────────────────────────────────
  const toggleApproval = (index: number) =>
    setSelected((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index],
    );

  const toggleSelectAll = () => {
    if (selected.length === filteredRows.length && filteredRows.length > 0) {
      setSelected([]);
    } else {
      setSelected(filteredRows.map((_, i) => i));
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
        // Refresh active report status in list
        loadSavedReports();
      } else if (data.error) {
        backendMsg = data.error;
      }
    } catch {
      // Graceful fallback
    }

    toast(backendMsg);
  };

  // Export filtered dataset to XLSX format (replaces CSV export)
  const exportFilteredRowsToXlsx = () => {
    if (filteredRows.length === 0) {
      toast("No data available to export");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(filteredRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Filtered Report Data");

    const cleanBase = (fileName || "report").toLowerCase().replace(/\s+/g, "-");
    const outputFileName = `${cleanBase}-filtered.xlsx`;
    XLSX.writeFile(workbook, outputFileName);
    toast(`Exported ${filteredRows.length} rows to XLSX`);

    // Audit log
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

  // Calculate sum of numeric columns if any
  const numericSum = amountKey
    ? filteredRows.reduce((acc, r) => {
        const val = parseFloat(String(r[amountKey]).replace(/[^0-9.-]+/g, ""));
        return acc + (isNaN(val) ? 0 : val);
      }, 0)
    : 0;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span>Main menu</span>
            <ChevronRight size={12} />
            <span className="text-slate-600">Dynamic Reports</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950 flex items-center gap-2.5">
            <FileSpreadsheet className="text-[#18476A]" size={26} />
            Reports Operations
          </h1>
        </div>

        {/* Upload & Actions */}
        {permissions.add && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json"
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

      {/* ── Report-Wise Selector & Filter Bar ── */}
      <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col gap-3.5 border-b border-slate-100 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers size={14} className="text-[#18476A]" />
              Select Report:
            </span>
            <span className="rounded-full bg-[#eef6fa] px-2.5 py-0.5 text-[11px] font-bold text-[#18476A]">
              {savedReports.length} Available
            </span>
          </div>

          {/* Report filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Report */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-2.5 text-slate-400"
              />
              <input
                value={reportSearchQuery}
                onChange={(e) => setReportSearchQuery(e.target.value)}
                placeholder="Search reports..."
                className="h-8 w-44 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2.5 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2]"
              />
            </div>

            {/* Date Range Filter (From / To) for Report Created/Added Date */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
              <div className="flex items-center gap-1 px-1.5 text-xs text-slate-500 font-medium">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  From
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-[#8fc3e0]"
                  title="Report Created From Date"
                />
              </div>
              <div className="flex items-center gap-1 px-1.5 text-xs text-slate-500 font-medium">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  To
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-700 outline-none focus:border-[#8fc3e0]"
                  title="Report Created To Date"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  title="Clear Date Range"
                  className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter by Report Type */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400 font-medium hidden sm:inline">
                Type:
              </span>
              <select
                value={reportTypeFilter}
                onChange={(e) => setReportTypeFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#8fc3e0]"
              >
                <option value="All">All Types</option>
                {availableReportTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Status */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400 font-medium hidden sm:inline">
                Status:
              </span>
              <select
                value={reportStatusFilter}
                onChange={(e) => setReportStatusFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#8fc3e0]"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Review">Review</option>
              </select>
            </div>

            <button
              onClick={loadSavedReports}
              title="Refresh reports"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
            >
              <RefreshCw
                size={13}
                className={loadingReports ? "animate-spin text-[#18476A]" : ""}
              />
            </button>
          </div>
        </div>

        {/* Scrollable Report Cards Bar */}
        <div className="mt-3.5 flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-thin">
          {filteredReportsList.map((report) => {
            const isSelected =
              (report._id || report.reportId) === selectedReportId;
            return (
              <button
                key={report._id || report.reportId || report.name}
                onClick={() => selectReport(report)}
                className={`flex shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                  isSelected
                    ? "border-[#18476A] bg-[#eef6fa] ring-2 ring-[#18476A]/20"
                    : "border-slate-200/90 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div
                  className={`grid h-8 w-8 place-items-center rounded-lg ${
                    isSelected
                      ? "bg-[#18476A] text-white"
                      : "bg-white text-slate-500 shadow-sm"
                  }`}
                >
                  <FileSpreadsheet size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 line-clamp-1">
                      {report.name}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                        report.status === "Approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : report.status === "Review"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {report.status || "Pending"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {report.type} · {report.rowsCount ?? 0} rows ·{" "}
                    {report.owner}
                  </p>
                </div>
              </button>
            );
          })}

          {filteredReportsList.length === 0 && (
            <div className="w-full py-3 text-center text-xs text-slate-400">
              No saved reports match the active type or status filter.
            </div>
          )}
        </div>
      </div>

      {/* ── Empty State Banner (when no report selected) ── */}
      {!fileName && (
        <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <FileSpreadsheet size={34} className="mx-auto text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">
            No report dataset selected
          </h3>
          <p className="mt-1 text-xs text-slate-500 mb-4">
            Select a saved report from above or upload a spreadsheet to
            dynamically render data.
          </p>
          {permissions.add && (
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-xs font-semibold text-white hover:bg-[#123955]"
            >
              <Upload size={15} />
              Upload report file
            </button>
          )}
        </div>
      )}

      {/* ── Main Data Viewer Container ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        {/* Controls Toolbar */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {fileName ? fileName : "Report Viewer"}
              </h3>
              {isGroupedLedger && (
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700">
                  Financial Ledger Detected
                </span>
              )}
              {(startDate || endDate) && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 flex items-center gap-1">
                  <Calendar size={10} />
                  Date Filter Active
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Showing {filteredRows.length} of {rows.length} rows ·{" "}
              {selected.length} row(s) marked approved
            </p>
          </div>

          {/* Export XLSX Button */}
          {permissions.export && (
            <button
              onClick={exportFilteredRowsToXlsx}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition shadow-sm"
              title="Export filtered data to Excel XLSX"
            >
              <FileSpreadsheet size={15} className="text-emerald-700" />
              Export XLSX
            </button>
          )}
        </div>

        {/* ── Active View Rendering ── */}

        {/* 1. Side-by-Side Financial Ledger View */}
        {effectiveViewMode === "ledger" && isGroupedLedger && (
          <LedgerTableView
            rows={filteredRows}
            columns={columns}
            transactionKey={transactionKey!}
            typeKey={typeKey!}
            amountKey={amountKey!}
            selected={selected}
            toggleApproval={toggleApproval}
            toast={toast}
          />
        )}

        {/* 2. Standard Tabular Grid View */}
        {effectiveViewMode === "grid" && (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#f8f8fc] text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  <th className="sticky left-0 bg-[#f8f8fc] px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleSelectAll}
                        className={`grid h-4 w-4 place-items-center rounded border ${
                          selected.length === filteredRows.length &&
                          filteredRows.length > 0
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </button>
                      <span>Approve</span>
                    </div>
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="border-b border-l border-slate-100 px-5 py-3.5 font-bold text-slate-500"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => {
                  const isApproved = selected.includes(index);
                  const user = getAuthUser();
                  const currentUserName =
                    user?.name || user?.email?.split("@")[0] || "BHAVESH";

                  return (
                    <tr
                      key={index}
                      className={`border-b border-slate-100 transition ${
                        isApproved
                          ? "bg-[#d3efe6] hover:bg-[#c4ebd3]"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      <td className="sticky left-0 border-r border-b border-slate-100 bg-inherit px-5 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <button
                            onClick={() => toggleApproval(index)}
                            className={`grid h-5 w-5 place-items-center rounded border transition ${
                              isApproved
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                            }`}
                          >
                            <Check size={13} strokeWidth={3} />
                          </button>
                          {isApproved && (
                            <span className="inline-flex items-center rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap">
                              By - {currentUserName}
                            </span>
                          )}
                        </div>
                      </td>
                      {columns.map((column) => (
                        <td
                          key={column}
                          className="border-b border-l border-slate-100 px-5 py-3.5 text-xs font-medium text-slate-700"
                        >
                          {column === typeKey ? (
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                /debit/i.test(row[column])
                                  ? "bg-rose-50 text-rose-700"
                                  : /credit/i.test(row[column])
                                    ? "bg-teal-50 text-teal-700"
                                    : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {row[column]}
                            </span>
                          ) : (
                            row[column] || "—"
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <div className="p-12 text-center text-sm text-slate-400">
                No matching rows found in this report. Try resetting your query
                or filters.
              </div>
            )}
          </div>
        )}

        {/* 3. Analytics View */}
        {effectiveViewMode === "analytics" && (
          <div className="p-6">
            <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <PieChart size={16} className="text-[#18476A]" />
              Report Data Breakdown & Distribution
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
                    ? Math.round((selected.length / filteredRows.length) * 100)
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
            onClick={saveApprovalsToBackend}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <Check size={14} />
            Save row approvals
          </button>
        </div>
      </div>

      {/* ── Toast Notifications ── */}
      {notice && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl animate-fade-in">
          {notice}
        </div>
      )}
    </div>
  );
}
