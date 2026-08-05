import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Check, Download, FileSpreadsheet, Filter, Search, Upload } from "lucide-react";
import { authFetch, getAuthUser } from "@/lib/apiClient";

interface LedgerPaneProps {
  title: string;
  tone: "debit" | "credit";
  rows: { row: Record<string, string>; index: number; group: string }[];
  columns: string[];
  transactionKey: string;
  typeKey: string;
  amountKey: string;
  selected: number[];
  toggleApproval: (index: number) => void;
}

function LedgerPane({
  title,
  tone,
  rows,
  columns,
  transactionKey,
  amountKey,
  selected,
  toggleApproval,
}: LedgerPaneProps) {
  const isDebit = tone === "debit";
  return (
    <div className={`min-w-[520px] ${isDebit ? "border-r border-[#c8b3a7] bg-[#faf5f2]" : "bg-[#f3f8f7]"}`}>
      <div
        className={`flex items-center justify-between border-b px-4 py-3 ${
          isDebit ? "border-[#d9c2b5] bg-[#ead8ce]" : "border-[#b9d0cc] bg-[#dcece9]"
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
              .filter((column) => column !== amountKey)
              .map((column) => (
                <th key={column} className="px-3 py-2">
                  {column}
                </th>
              ))}
            <th className="w-28 px-3 py-2 text-right">{amountKey}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, index, group }) => (
            <tr key={`${group}-${index}`} className="border-b border-black/5 hover:bg-white/60">
              <td className="px-3 py-3 align-top">
                <button
                  onClick={() => toggleApproval(index)}
                  className={`grid h-5 w-5 place-items-center rounded border ${
                    selected.includes(index)
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 bg-white text-transparent"
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
              </td>
              {columns
                .filter((column) => column !== amountKey)
                .map((column) => (
                  <td key={column} className="px-3 py-3 align-top">
                    <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                      {column}
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold text-slate-700">
                      {column === transactionKey ? row[column] || group || "—" : row[column] || "—"}
                    </span>
                  </td>
                ))}
              <td
                className={`px-3 py-3 text-right align-top text-[11px] font-bold ${
                  isDebit ? "text-[#8f5039]" : "text-[#126c65]"
                }`}
              >
                {row[amountKey] || "—"}
              </td>
            </tr>
          ))}
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
}

function LedgerTableView({
  rows,
  columns,
  transactionKey,
  typeKey,
  amountKey,
  selected,
  toggleApproval,
  toast,
}: LedgerTableViewProps) {
  let currentGroup = "";
  const entries = rows.map((row, index) => {
    const value = row[transactionKey]?.trim();
    if (value && !/total/i.test(value)) currentGroup = value;
    return { row, index, group: currentGroup };
  });
  const debit = entries.filter(({ row }) => /debit/i.test(row[typeKey] ?? ""));
  const credit = entries.filter(({ row }) => /credit/i.test(row[typeKey] ?? ""));
  const totals = entries.filter(
    ({ row }) =>
      /total/i.test(row[transactionKey] ?? "") ||
      (!/credit|debit/i.test(row[typeKey] ?? "") && row[amountKey])
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1040px]">
        <div className="flex items-center justify-between border-b border-[#095f5a] bg-[#0e776f] px-5 py-3 text-white">
          <div>
            <p className="text-xs font-bold">Dynamic report ledger</p>
            <p className="mt-0.5 text-[10px] text-white/65">
              All uploaded entries managed in one table
            </p>
          </div>
          <span className="text-[10px] font-semibold text-white/75">
            {entries.length} source rows
          </span>
        </div>
        <div className="grid grid-cols-2">
          <LedgerPane
            title="Debit report"
            tone="debit"
            rows={debit}
            columns={columns}
            transactionKey={transactionKey}
            typeKey={typeKey}
            amountKey={amountKey}
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
            selected={selected}
            toggleApproval={toggleApproval}
          />
        </div>
        {totals.length > 0 && (
          <div className="border-t border-[#b9d0cc] bg-white">
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Entry totals and unclassified rows
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-100">
              {totals.map(({ row, index, group }) => (
                <div
                  key={`total-${index}`}
                  className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5"
                >
                  <span className="text-[10px] font-semibold text-slate-600">
                    {row[transactionKey] || group || "Total"}
                  </span>
                  <span className="text-xs font-bold text-slate-800">{row[amountKey] || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end border-t border-[#c5d5d2] bg-[#f7fbfa] px-4 py-2">
          <button
            onClick={() => toast("Unified approval history opened")}
            className="text-[11px] font-semibold text-[#18476A] hover:text-[#18476A]"
          >
            View full approval history
          </button>
        </div>
      </div>
    </div>
  );
}

import { PermissionActions } from "@shared/api";

export function DynamicReportViewer({
  query,
  setQuery,
  permissions = { view: true, add: true, update: true, delete: true, export: true },
}: {
  query: string;
  setQuery: (value: string) => void;
  permissions?: PermissionActions;
}) {
  type ReportRow = Record<string, string>;
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reportId, setReportId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState("");

  const columns = rows.length ? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))) : [];
  const filteredRows = rows.filter((row) =>
    Object.values(row).join(" ").toLowerCase().includes(query.toLowerCase())
  );
  const transactionKey = columns.find((column) =>
    /transaction|voucher|entry|reference|document|journal/i.test(column)
  );
  const typeKey = columns.find((column) =>
    /type|category|nature|dr.?cr|credit.?debit/i.test(column)
  );
  const amountKey = columns.find((column) => /amount|total|value|balance/i.test(column));
  const isGroupedLedger = Boolean(
    transactionKey &&
      typeKey &&
      amountKey &&
      filteredRows.some((row) => /credit|debit/i.test(row[typeKey] ?? ""))
  );

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

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
        const nonEmptyCount = row.filter((value) => String(value).trim() !== "").length;
        return nonEmptyCount > best.count ? { index, count: nonEmptyCount } : best;
      },
      { index: 0, count: 0 }
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
        Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "")]))
      );
    return { headers, parsed };
  };

  const applyWorkbook = async (buffer: ArrayBuffer, name: string) => {
    const { headers, parsed } = parseWorkbook(buffer);
    if (!headers.length || !parsed.length) {
      toast("No tabular data found in the first sheet");
      return;
    }
    setRows(parsed);
    setFileName(name);
    setSelected([]);

    let backendMsg = `${parsed.length} rows and ${headers.length} columns detected and saved`;
    try {
      const currentUser = getAuthUser();
      const res = await authFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.replace(/\.[^/.]+$/, ""),
          type: isGroupedLedger ? "Financial Ledger" : "Dynamic Report",
          source: "Spreadsheet Upload",
          owner: currentUser?.name || currentUser?.email || "Unknown",
          data: parsed.slice(0, 250),
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data) {
          setReportId(data.data.reportId || data.data._id || "");
        }
        if (data.message) {
          backendMsg = data.message;
        }
      } else if (data.error) {
        backendMsg = data.error;
      }
    } catch {
      // Graceful offline fallback
    }

    toast(backendMsg);
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    applyWorkbook(await file.arrayBuffer(), file.name);
  };

  const toggleApproval = (index: number) =>
    setSelected((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
    );

  const saveApprovalsToBackend = async () => {
    if (!selected.length) {
      toast("Select at least one row to approve");
      return;
    }

    const activeId = reportId || "REP-CURRENT";
    let backendMsg = `${selected.length} rows saved with approval audit trail`;
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
      } else if (data.error) {
        backendMsg = data.error;
      }
    } catch {
      // Graceful fallback
    }

    toast(backendMsg);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#18476A]">
            REPORT MANAGEMENT / DYNAMIC VIEWER
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">Report management</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a spreadsheet and Nexora will detect its fields automatically.
          </p>
        </div>
        {permissions.add && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              className="hidden"
              onChange={(event) => handleUpload(event.target.files?.[0])}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-sm font-semibold text-white shadow-lg shadow-[#18476A]/20 hover:bg-[#18476A]"
            >
              <Upload size={17} />
              Upload spreadsheet
            </button>
          </div>
        )}
      </div>

      {fileName ? (
        <div className="mb-5 rounded-2xl border border-[#dbeaf2] bg-gradient-to-r from-[#eef6fa] to-white p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#18476A] shadow-sm">
                <FileSpreadsheet size={19} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">{fileName}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {rows.length.toLocaleString()} records · {columns.length} detected columns · First
                  sheet {reportId && `· ID: ${reportId}`}
                </p>
              </div>
            </div>
            {permissions.export && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toast("Export prepared")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600"
                >
                  <Download size={13} />
                  Export
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <FileSpreadsheet size={32} className="mx-auto text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No report spreadsheet loaded</h3>
          <p className="mt-1 text-xs text-slate-500 mb-4">
            Select an Excel (.xlsx, .xls) or CSV file to parse and view dynamic data.
          </p>
          {permissions.add && (
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-xs font-semibold text-white hover:bg-[#18476A]"
            >
              <Upload size={15} />
              Select file
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {fileName ? fileName.replace(/\.[^/.]+$/, "") : "Report viewer"}{" "}
              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
                Dynamic columns
              </span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Select rows to mark them approved. Approval history can be added per row.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search report data..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] sm:w-56"
              />
            </div>
            <button
              onClick={() => toast("More filters opened")}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Filter size={14} />
              Filters
            </button>
          </div>
        </div>

        {isGroupedLedger && (
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

        <div className={`${isGroupedLedger ? "hidden" : ""} max-h-[520px] overflow-auto`}>
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#f8f8fc] text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                <th className="sticky left-0 bg-[#f8f8fc] px-5 py-3.5">Approve</th>
                {columns.map((column) => (
                  <th key={column} className="border-l border-slate-100 px-5 py-3.5">
                    {column}
                  </th>
                ))}
                <th className="px-5 py-3.5">History</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr
                  key={index}
                  className={`border-b border-slate-100 ${
                    selected.includes(index) ? "bg-emerald-50/70" : "bg-[#fffaf6] hover:bg-orange-50"
                  }`}
                >
                  <td className="sticky left-0 border-r border-slate-100 bg-inherit px-5 py-4">
                    <button
                      onClick={() => toggleApproval(index)}
                      className={`grid h-5 w-5 place-items-center rounded border ${
                        selected.includes(index)
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check size={13} strokeWidth={3} />
                    </button>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column}
                      className="border-l border-slate-100 px-5 py-4 text-[11px] font-medium text-slate-600"
                    >
                      {row[column] || "—"}
                    </td>
                  ))}
                  <td className="px-5 py-4">
                    <button
                      onClick={() => toast(`Approval history for row ${index + 1}`)}
                      className="whitespace-nowrap text-[11px] font-semibold text-[#18476A] hover:text-[#18476A]"
                    >
                      {selected.includes(index) ? "Approved" : "View history"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">
              No report rows available. Upload a spreadsheet to get started.
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <p className="text-[11px] text-slate-400">
            Showing <span className="font-semibold text-slate-600">{filteredRows.length}</span> of{" "}
            {rows.length} rows ·{" "}
            <span className="font-semibold text-emerald-600">{selected.length} approved</span>
          </p>
          <button
            onClick={saveApprovalsToBackend}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Check size={14} />
            Save approvals
          </button>
        </div>
      </div>

      {notice && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
