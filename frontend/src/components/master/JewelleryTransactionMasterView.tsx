import { useEffect, useState, useRef, useMemo } from "react";
import {
  Coins,
  Upload,
  RefreshCw,
  Trash2,
  Calendar,
  Layers,
  Database,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  X,
  Tag,
  Clock,
  Sparkles,
  ArrowRight,
  Clock3,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { authFetch } from "@/lib/apiClient";
import type { PermissionActions } from "@shared/api";

interface JewelleryTransactionMasterViewProps {
  permissions?: PermissionActions;
}

interface ReportInfo {
  _id?: string;
  reportName?: string;
  sourceFile?: string;
  rowCount?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DateInfo {
  dateKey?: string | null;
  dateDisplay?: string | null;
  minDate?: string | null;
  maxDate?: string | null;
}

export function JewelleryTransactionMasterView({ permissions }: JewelleryTransactionMasterViewProps) {
  const navigate = useNavigate();
  const canAdd = permissions?.add ?? true;
  const canDelete = permissions?.delete ?? true;

  const [data, setData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [reportInfo, setReportInfo] = useState<ReportInfo | null>(null);
  const [dateInfo, setDateInfo] = useState<DateInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [totalDbRows, setTotalDbRows] = useState<number>(0);
  const [totalMasterCategories, setTotalMasterCategories] = useState<number>(0);
  const [datasetUniqueCategories, setDatasetUniqueCategories] = useState<string[]>([]);

  // Clear Confirmation Modal
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; sub?: string; type: "success" | "error" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (message: string, sub?: string, type: "success" | "error" = "success") => {
    setToast({ message, sub, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Fetch Dataset Info
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/jewellery-transactions");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json.data || []);
          setHeaders(json.headers || []);
          setCategoryKey(json.categoryKey || null);
          setDateInfo(json.dateInfo || null);
          setReportInfo(json.reportInfo || null);
          setTotalDbRows(json.totalRaw || json.reportInfo?.rowCount || (json.data ? json.data.length : 0));
          setTotalMasterCategories(json.totalMasterCategories || 0);
          setDatasetUniqueCategories(json.uniqueCategories || []);
        }
      }
    } catch (err: any) {
      showToast("Error loading dataset", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Unique categories count in dataset
  const uniqueCategoriesCount = useMemo(() => {
    if (datasetUniqueCategories.length > 0) return datasetUniqueCategories.length;
    if (totalMasterCategories > 0) return totalMasterCategories;
    if (!categoryKey || data.length === 0) return 0;
    const set = new Set<string>();
    data.forEach((r) => {
      const cat = String(r[categoryKey] || "").trim();
      if (cat && cat !== "-" && cat !== "N/A") set.add(cat.toLowerCase());
    });
    return set.size;
  }, [datasetUniqueCategories, totalMasterCategories, data, categoryKey]);

  // Process File Upload
  const processUploadFile = async (file: File) => {
    if (!file) return;

    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        showToast("No readable sheet found in Excel file.", undefined, "error");
        setUploading(false);
        return;
      }

      // Convert sheet to JSON rows
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false,
      });

      // Filter out static Excel Total / Grand Total / summary footer rows
      const validRows = rawRows.filter((r) => {
        if (!r || typeof r !== "object") return false;
        const entries = Object.entries(r);
        if (entries.length === 0) return false;

        // 1. Check if any cell contains "total"
        for (const [, val] of entries) {
          if (val !== undefined && val !== null) {
            const s = String(val).trim().toLowerCase();
            if (
              s === "total" ||
              s === "grand total" ||
              s === "grand_total" ||
              s === "totals" ||
              s === "sub total" ||
              s === "subtotal" ||
              s.includes("grand total") ||
              s.startsWith("total") ||
              s.endsWith("total")
            ) {
              return false;
            }
          }
        }

        // 2. Check first or last cell value
        const firstVal = entries[0]?.[1];
        const lastVal = entries[entries.length - 1]?.[1];
        if (typeof firstVal === "string" && firstVal.toLowerCase().includes("total")) return false;
        if (typeof lastVal === "string" && lastVal.toLowerCase().includes("total")) return false;

        // 3. Detect summary rows with multiple hyphens '-' or missing business fields
        let hyphenCount = 0;
        let numCount = 0;
        let hasValidCategoryOrCustomer = false;
        for (const [k, val] of entries) {
          if (val === "-" || val === "–" || val === "—" || val === "N/A" || val === "n/a") {
            hyphenCount++;
          } else if (typeof val === "number" || (!isNaN(Number(val)) && String(val).trim() !== "")) {
            numCount++;
          }
          const normKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            normKey.includes("category") ||
            normKey.includes("customer") ||
            normKey.includes("client") ||
            normKey.includes("jewelcode") ||
            normKey.includes("orderbagno")
          ) {
            const str = String(val ?? "").trim().toLowerCase();
            if (str !== "-" && str !== "–" && str !== "—" && str !== "total" && str !== "n/a" && str !== "") {
              hasValidCategoryOrCustomer = true;
            }
          }
        }
        if (!hasValidCategoryOrCustomer && (numCount > 0 || hyphenCount > 0)) return false;
        if (hyphenCount >= 3) return false;
        return true;
      });

      if (!validRows || validRows.length === 0) {
        showToast("The uploaded sheet has no valid transaction rows.", undefined, "error");
        setUploading(false);
        return;
      }

      // Filter out any trailing or empty TOTAL column header
      const extractedHeaders = Object.keys(validRows[0] || {}).filter((h) => {
        const norm = h.trim().toLowerCase();
        return norm !== "total" && norm !== "grand total" && !norm.startsWith("__empty");
      });

      const CHUNK_SIZE = 1500;
      const totalBatches = Math.ceil(validRows.length / CHUNK_SIZE);
      let totalNewRowsInserted = 0;
      let totalDuplicateRowsSkipped = 0;
      let totalNewCategoriesCreated = 0;

      for (let i = 0; i < totalBatches; i++) {
        const batchData = validRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const payload = {
          fileName: file.name,
          reportName: file.name.replace(/\.[^/.]+$/, ""),
          headers: extractedHeaders,
          data: batchData,
        };

        const res = await authFetch("/api/jewellery-transactions/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          throw new Error(result.error || `Failed uploading batch ${i + 1} of ${totalBatches}`);
        }

        totalNewRowsInserted += result.newRowsInserted || 0;
        totalDuplicateRowsSkipped += result.duplicateRowsSkipped || 0;
        totalNewCategoriesCreated += result.newCategoriesCreated || 0;
      }

      const insertMsg =
        totalNewRowsInserted > 0
          ? `Inserted ${totalNewRowsInserted.toLocaleString()} new entries (${totalDuplicateRowsSkipped.toLocaleString()} duplicate rows skipped)`
          : `All ${totalDuplicateRowsSkipped.toLocaleString()} entries are already in database`;

      const catMsg =
        totalNewCategoriesCreated > 0
          ? `✨ ${totalNewCategoriesCreated} new unique categories synchronized to Category Master.`
          : `Categories are fully synchronized.`;

      showToast(insertMsg, catMsg);
      fetchTransactions();
    } catch (error: any) {
      console.error("Excel upload error:", error);
      showToast("Error processing Excel file", error.message || "Invalid Excel structure", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Handle Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadFile(file);
    }
  };

  // Handle Clear Dataset
  const handleClearData = async () => {
    setClearLoading(true);
    try {
      const res = await authFetch("/api/jewellery-transactions", {
        method: "DELETE",
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showToast("Transaction dataset cleared successfully");
        setData([]);
        setHeaders([]);
        setDateInfo(null);
        setReportInfo(null);
        setClearConfirmOpen(false);
      } else {
        showToast("Failed to clear dataset", result.error, "error");
      }
    } catch (err: any) {
      showToast("Error clearing dataset", err.message, "error");
    } finally {
      setClearLoading(false);
    }
  };

  const formattedUploadTime = useMemo(() => {
    if (!reportInfo?.createdAt) return null;
    try {
      return new Date(reportInfo.createdAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return reportInfo.createdAt;
    }
  }, [reportInfo?.createdAt]);

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-800 animate-in slide-in-from-bottom-5 duration-200 max-w-md">
          {toast.type === "success" ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-0.5">
            <p className="text-xs font-bold">{toast.message}</p>
            {toast.sub && <p className="text-[11px] text-slate-400">{toast.sub}</p>}
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white p-0.5 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processUploadFile(file);
        }}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* Main Header Banner with Live File Info & Date Ratio */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#18476A]/10 dark:bg-[#18476A]/30 text-[#18476A] dark:text-cyan-400">
              <Coins size={22} />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#18476A] dark:text-cyan-400">
                JEWELLERY TRANSACTION
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Jewellery Transaction Master
              </h1>
            </div>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Upload transaction Excel datasets, view active file coverage dates, and sync unique categories.
          </p>

          {/* Dynamic Badges: Report Date Ratio, Last Upload Time, and Source File */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-xs">
            {dateInfo?.dateDisplay ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-900/60 shadow-2xs">
                <Calendar size={14} className="text-amber-600 dark:text-amber-400" />
                <span>
                  Report Date: <strong className="font-extrabold text-slate-900 dark:text-white">{dateInfo.dateDisplay}</strong>
                  {dateInfo.dateKey && (
                    <span className="ml-1 text-[10px] font-mono text-amber-700/80 dark:text-amber-400/80">({dateInfo.dateKey})</span>
                  )}
                </span>
              </span>
            ) : data.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-900/60 shadow-2xs">
                <Calendar size={14} className="text-amber-600 dark:text-amber-400" />
                <span>Report Date: Continuous Dataset</span>
              </span>
            ) : null}

            {formattedUploadTime && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-600 shadow-2xs">
                <Clock3 size={14} className="text-[#18476A] dark:text-cyan-400" />
                <span>
                  Last Uploaded: <strong className="font-bold text-slate-900 dark:text-white">{formattedUploadTime}</strong>
                  {reportInfo?.uploadedBy && (
                    <span className="ml-1 text-slate-500 dark:text-slate-400 text-[11px]">(by {reportInfo.uploadedBy})</span>
                  )}
                </span>
              </span>
            )}

            {reportInfo?.sourceFile && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-[#18476A] dark:text-cyan-300 font-medium border border-cyan-200 dark:border-cyan-800 shadow-2xs">
                <FileSpreadsheet size={14} className="text-[#18476A] dark:text-cyan-400" />
                <span className="font-bold">{reportInfo.sourceFile}</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center shrink-0">
          <button
            onClick={fetchTransactions}
            disabled={loading}
            title="Refresh"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          {canDelete && data.length > 0 && (
            <button
              onClick={() => setClearConfirmOpen(true)}
              title="Clear Dataset"
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 transition cursor-pointer shadow-2xs"
            >
              <Trash2 size={14} />
              <span>Clear Data</span>
            </button>
          )}

          {canAdd && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Upload size={14} className={uploading ? "animate-bounce" : ""} />
              <span>{uploading ? "Uploading..." : "Upload Excel"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Dataset Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Stored Records */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Total Transaction Records
            </span>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {totalDbRows > 0 ? totalDbRows.toLocaleString() : data.length.toLocaleString()}
            </h3>
            <span className="text-[10px] text-slate-400 block">Stored rows in database</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#18476A]/10 dark:bg-cyan-950/40 text-[#18476A] dark:text-cyan-400">
            <Database size={22} />
          </div>
        </div>

        {/* 2. Detected Columns */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Available Headers
            </span>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {headers.length}
            </h3>
            <span className="text-[10px] text-slate-400 block">Columns detected from Excel</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Layers size={22} />
          </div>
        </div>

        {/* 3. Synced Categories */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Categories Linked
            </span>
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {uniqueCategoriesCount}
            </h3>
            <span className="text-[10px] text-emerald-600/80 font-semibold block">
              {totalMasterCategories > 0 ? `${totalMasterCategories} in Category Master` : "Synced with Category Master"}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Tag size={22} />
          </div>
        </div>
      </div>

      {/* Upload Dropzone Card */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`p-10 rounded-3xl bg-white dark:bg-slate-800 border-2 border-dashed transition text-center space-y-4 shadow-xs ${
          isDragOver
            ? "border-[#18476A] dark:border-cyan-400 bg-cyan-50/20 dark:bg-cyan-950/20"
            : "border-slate-300 dark:border-slate-700"
        }`}
      >
        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center text-[#18476A] dark:text-cyan-400">
          <FileSpreadsheet size={32} />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">
            Upload Transaction Dataset (.xlsx, .xls, .csv)
          </h3>
          <p className="text-xs text-slate-400">
            Drag & drop your Excel file here, or click to browse. Existing records will be deduplicated and unique categories will automatically sync.
          </p>
        </div>

        {canAdd && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50"
          >
            <Upload size={16} className={uploading ? "animate-bounce" : ""} />
            <span>{uploading ? "Uploading & Processing..." : "Choose Excel File"}</span>
          </button>
        )}
      </div>

      {/* Link to Report View */}
      {data.length > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-[#18476A]/10 via-cyan-500/10 to-indigo-500/10 border border-[#18476A]/20 dark:border-cyan-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#18476A] text-white">
              <Sparkles size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Ready to view analytics & calculations?
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Open the Transaction Report to inspect Order Days, Actual Profit, and Profit % with filters.
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate("/jewellery-transactions")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-xs cursor-pointer self-stretch sm:self-auto justify-center"
          >
            <span>Open Transaction Report</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {clearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/50">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Clear All Master Transactions?
                </h3>
                <p className="text-xs text-slate-500">
                  This action cannot be undone. All stored records will be removed from the database.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setClearConfirmOpen(false)}
                disabled={clearLoading}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={clearLoading}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {clearLoading ? "Clearing..." : "Yes, Clear All Data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
