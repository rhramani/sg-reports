import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileSpreadsheet,
  RefreshCw,
  Search,
  Check,
  AlertCircle,
  Trash2,
  Eye,
  X,
  Layers,
  Sparkles,
  FileText,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  Calendar,
  Clock3,
  SlidersHorizontal,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Timer,
  Tag,
  Users,
  Bookmark,
  BookmarkPlus,
  BookmarkCheck,
  IndianRupee,
  Percent,
  Calculator,
  Coins,
  TrendingUp,
  ArrowRight,
  FolderTree,
  ListTree,
  Plus,
  Network,
  Home,
  CornerDownRight,
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { authFetch } from "@/lib/apiClient";
import type { PermissionActions } from "@shared/api";

export interface SavedFilterPreset {
  id: string;
  name: string;
  createdAt: string;
  searchQuery: string;
  columnFilters: Record<string, string>;
  selectedDateCol: string;
  startDate: string;
  endDate: string;
  fromOrderDateCol: string;
  toInwardDateCol: string;
  selectedColumns?: string[];
  currentGroupByField?: string;
}

export interface GroupDimensionOption {
  id: string;
  label: string;
  aliases: string[];
}

// Global comprehensive detector for static summary/total rows from uploaded Excel sheets
export function isTotalSummaryRow(row: Record<string, any>): boolean {
  if (!row || typeof row !== "object") return true;

  const entries = Object.entries(row);
  if (entries.length === 0) return true;

  let hyphenCount = 0;
  let numCount = 0;
  let hasTotalWord = false;
  let hasValidDate = false;
  let hasValidCategoryOrCustomer = false;

  for (const [key, val] of entries) {
    if (val === undefined || val === null) continue;
    const str = String(val).trim();
    if (!str) continue;

    const lower = str.toLowerCase();
    if (
      lower === "total" ||
      lower === "grand total" ||
      lower === "grand_total" ||
      lower === "totals" ||
      lower === "sub total" ||
      lower === "subtotal" ||
      lower.includes("grand total") ||
      lower.startsWith("total") ||
      lower.endsWith("total")
    ) {
      hasTotalWord = true;
    }

    if (str === "-" || str === "–" || str === "—" || lower === "n/a" || lower === "null") {
      hyphenCount++;
    } else if (typeof val === "number" || (!isNaN(Number(str)) && str !== "-")) {
      numCount++;
    }

    // Check date patterns
    if (
      /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(str) ||
      /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(str)
    ) {
      hasValidDate = true;
    }

    // Check category / customer
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      normKey.includes("category") ||
      normKey.includes("customer") ||
      normKey.includes("client") ||
      normKey.includes("jewelcode") ||
      normKey.includes("orderbagno")
    ) {
      if (str !== "-" && str !== "–" && str !== "—" && lower !== "total" && lower !== "n/a" && str !== "") {
        hasValidCategoryOrCustomer = true;
      }
    }
  }

  // 1. Direct keyword match
  if (hasTotalWord) return true;

  // 2. Hyphenated summary row with numbers and missing primary business fields
  if (!hasValidCategoryOrCustomer && (numCount > 0 || hyphenCount > 0)) {
    return true;
  }

  // 3. Row with 3+ hyphens
  if (hyphenCount >= 3) return true;

  return false;
}

export const PRESET_GROUP_DIMENSIONS: GroupDimensionOption[] = [
  { id: "ClientCity", label: "Clientcity", aliases: ["clientcity", "client_city", "city"] },
  { id: "Category", label: "Category", aliases: ["category", "item_category", "cat"] },
  { id: "CategoryGroup", label: "Category group", aliases: ["categorygroup", "category_group", "catgroup", "group"] },
  { id: "StateName", label: "State", aliases: ["statename", "state_name", "state"] },
  { id: "BaseMetalClarity", label: "Base metal clarity", aliases: ["basemetalclarity", "base_metal_clarity", "metalclarity", "clarity", "purity"] },
  { id: "SalesPerson", label: "Sales person", aliases: ["salesperson", "salespersonname", "sales_person", "sales_person_name"] },
  { id: "SalesPersonHeadName", label: "Sales person head", aliases: ["salespersonheadname", "sales_person_head", "saleshead"] },
  { id: "Order_CustomerName", label: "Customer wise", aliases: ["client", "clientname", "client_name", "order_customername", "customername", "customer", "party", "partyname", "party_name"] },
  { id: "BookAliasName", label: "Book alias name", aliases: ["bookaliasname", "book_alias_name", "bookalias", "bookname"] },
];

export interface DrillStep {
  groupKey: string;
  groupLabel: string;
  groupValue: string;
}

export interface GroupSummaryItem {
  groupKey: string;
  groupLabel: string;
  groupValue: string;
  rowCount: number;
  totalGrossWt: number;
  totalNetWt: number;
  totalActPureWt: number;
  totalPureWt: number;
  totalPureWtPlusLoss: number;
  totalTranVsClarityDiff: number;
  totalTransPrice: number;
  totalActualProfit: number; // Net P&L (₹)
  avgPercentage: number | null; // Net % (formula base)
  avgCompletedOrderDays: number | null;
  minCompletedOrderDays: number | null;
  maxCompletedOrderDays: number | null;
}

interface JewelleryTransactionReportViewProps {
  permissions?: PermissionActions;
}

export function JewelleryTransactionReportView({
  permissions,
}: JewelleryTransactionReportViewProps) {
  const navigate = useNavigate();
  const canExport = permissions?.export ?? true;

  const [loading, setLoading] = useState(true);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [categoryMasterList, setCategoryMasterList] = useState<
    { _id?: string; name: string; baseMetal?: string; costing?: number }[]
  >([]);
  const [reportInfo, setReportInfo] = useState<{
    _id?: string;
    reportName?: string;
    sourceFile?: string;
    rowCount?: number;
    uploadedBy?: string;
    createdAt?: string;
  } | null>(null);

  const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [dateInfo, setDateInfo] = useState<{
    dateKey: string | null;
    dateDisplay: string | null;
    minDate?: string;
    maxDate?: string;
  } | null>(null);

  // Step-by-Step Guided Drill-Down State
  const [drillPath, setDrillPath] = useState<DrillStep[]>([]);
  const [currentGroupByField, setCurrentGroupByField] = useState<string>("");

  // Identify the active explore/drill context (e.g., "__global__" or "Category:Mangalsutra")
  const currentContextKey = useMemo(() => {
    if (drillPath.length === 0) return "__global__";
    return drillPath.map((s) => `${s.groupKey}:${s.groupValue}`).join(" > ");
  }, [drillPath]);

  const currentContextLabel = useMemo(() => {
    if (drillPath.length === 0) return "All Transactions";
    return drillPath.map((s) => s.groupValue).join(" / ");
  }, [drillPath]);

  // Column Visibility Management (Persisted Per Explored Group/Category)
  const [contextColumnsMap, setContextColumnsMap] = useState<Record<string, string[]>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("sg_jewellery_report_columns_by_context");
        if (saved) return JSON.parse(saved);
        const legacyGlobal = localStorage.getItem("sg_jewellery_report_columns");
        if (legacyGlobal) {
          return { __global__: JSON.parse(legacyGlobal) };
        }
      } catch {}
    }
    return {};
  });

  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState("");

  // Synchronize active selectedColumns when switching between explored groups/categories
  useEffect(() => {
    if (headers.length === 0) return;
    const savedForContext = contextColumnsMap[currentContextKey];
    if (savedForContext && Array.isArray(savedForContext) && savedForContext.length > 0) {
      const valid = savedForContext.filter((h) => headers.includes(h));
      setSelectedColumns(valid.length > 0 ? valid : headers);
    } else {
      // Default to all columns for newly explored groups until user customizes
      setSelectedColumns(headers);
    }
  }, [currentContextKey, headers]);

  // Detailed Table Column Sorting State
  const [sortCol, setSortCol] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Group Summary Table Column Sorting State
  const [groupSortCol, setGroupSortCol] = useState<string>("rowCount");
  const [groupSortOrder, setGroupSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (colKey: string) => {
    if (sortCol === colKey) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortCol("");
        setSortOrder("asc");
      }
    } else {
      setSortCol(colKey);
      setSortOrder("asc");
    }
  };

  const handleGroupSort = (colKey: string) => {
    if (groupSortCol === colKey) {
      setGroupSortOrder(groupSortOrder === "asc" ? "desc" : "asc");
    } else {
      setGroupSortCol(colKey);
      setGroupSortOrder("asc");
    }
  };

  // Saved Filter Presets State
  const [savedPresets, setSavedPresets] = useState<SavedFilterPreset[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("sg_jewellery_saved_filters");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);
  const [isManagePresetsModalOpen, setIsManagePresetsModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const activePreset = useMemo(() => {
    return savedPresets.find((p) => p.id === activePresetId) || null;
  }, [savedPresets, activePresetId]);

  // Purely Dynamic Filters State
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [selectedDateCol, setSelectedDateCol] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // OrderDate to InwardDate Days Calculation State
  const [fromOrderDateCol, setFromOrderDateCol] = useState<string>("");
  const [toInwardDateCol, setToInwardDateCol] = useState<string>("");

  // Pagination for Detailed Flat View
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Selected Row for Details Modal
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<{
    message: string;
    subMessage?: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, subMessage?: string, type: "success" | "error" = "success") => {
    setToast({ message, subMessage, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/jewellery-transactions");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const rawHeaders: string[] = json.headers || [];
          const cleanHeaders = rawHeaders.filter((h) => {
            const norm = h.trim().toLowerCase();
            return norm !== "total" && norm !== "grand total" && !norm.startsWith("__empty");
          });
          setHeaders(cleanHeaders);

          const rawData: Record<string, any>[] = json.allRows || json.data || [];
          const cleanData = rawData.filter((r) => !isTotalSummaryRow(r));
          setData(cleanData);
          setUniqueCategories(json.uniqueCategories || []);
          setCategoryKey(json.categoryKey || null);
          setDateInfo(json.dateInfo || null);
          setReportInfo(json.reportInfo || null);
        }
      }
    } catch (err) {
      console.error("Failed to load jewellery transaction report:", err);
      showToast("Failed to fetch transaction data", undefined, "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryMaster = async () => {
    try {
      const res = await authFetch("/api/categories");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCategoryMasterList(json.data);
        }
      }
    } catch (err) {
      console.error("Failed to load category master for costing lookup:", err);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchCategoryMaster();
  }, []);

  // Helper to resolve the matching column from headers for a given dimension
  const resolveHeaderForDimension = (dimId: string): string | null => {
    const dim = PRESET_GROUP_DIMENSIONS.find((d) => d.id === dimId);
    if (dim) {
      for (const alias of dim.aliases) {
        const direct = headers.find((h) => h.trim().toLowerCase() === alias.toLowerCase());
        if (direct) return direct;
      }
      for (const alias of dim.aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanAlias);
        if (match) return match;
      }
    }
    const found = headers.find((h) => h.trim().toLowerCase() === dimId.trim().toLowerCase());
    return found || null;
  };

  const getDimensionDisplayLabel = (colKey: string): string => {
    const dim = PRESET_GROUP_DIMENSIONS.find((d) => resolveHeaderForDimension(d.id) === colKey);
    return dim ? dim.label : colKey;
  };

  // Available Group By options for current level (strictly the 9 specified dimensions, excluding fields already in drillPath)
  const availableGroupOptions = useMemo(() => {
    const activeDrillKeys = drillPath.map((s) => s.groupKey.toLowerCase());

    const options = PRESET_GROUP_DIMENSIONS.map((d) => {
      const header = resolveHeaderForDimension(d.id);
      return {
        key: header || d.id,
        label: d.label,
        isAvailable: Boolean(header),
      };
    }).filter((opt) => opt.isAvailable && !activeDrillKeys.includes(opt.key.toLowerCase()));

    return options;
  }, [headers, drillPath]);

  // Persist column selection specifically for the active explored group/category
  const updateSelectedColumns = (cols: string[]) => {
    setSelectedColumns(cols);
    setContextColumnsMap((prev) => {
      const updatedMap = {
        ...prev,
        [currentContextKey]: cols,
      };
      try {
        localStorage.setItem("sg_jewellery_report_columns_by_context", JSON.stringify(updatedMap));
        if (currentContextKey === "__global__") {
          localStorage.setItem("sg_jewellery_report_columns", JSON.stringify(cols));
        }
      } catch {}
      return updatedMap;
    });
  };

  const toggleColumn = (col: string) => {
    const exists = selectedColumns.includes(col);
    const updated = exists ? selectedColumns.filter((c) => c !== col) : [...selectedColumns, col];
    updateSelectedColumns(updated);
  };

  const selectAllColumns = () => {
    updateSelectedColumns([...headers]);
    showToast("All columns enabled.");
  };

  const deselectAllColumns = () => {
    updateSelectedColumns([]);
    showToast("All columns disabled.");
  };

  const selectFirst20Columns = () => {
    const cols = headers.slice(0, 20);
    updateSelectedColumns(cols);
    showToast("Showing first 20 columns.");
  };

  // Filtered Headers that should be rendered in table
  const visibleHeaders = useMemo(() => {
    if (selectedColumns.length === 0) return headers;
    const filtered = headers.filter((h) => selectedColumns.includes(h));
    return filtered.length > 0 ? filtered : headers;
  }, [headers, selectedColumns]);

  const isStrictDateValue = (val: unknown): boolean => {
    if (!val) return false;
    const s = String(val).trim();
    if (s.length < 6 || s.length > 30) return false;

    if (/[a-zA-Z]/.test(s)) {
      const hasMonthName = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(s);
      if (!hasMonthName) return false;
    }

    const slashes = (s.match(/\//g) || []).length;
    const dashes = (s.match(/-/g) || []).length;
    const dots = (s.match(/\./g) || []).length;
    if (slashes !== 2 && dashes !== 2 && dots !== 2) return false;

    const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(T.*)?$/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      const d = parseInt(isoMatch[3], 10);
      return y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
    }

    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      const y = parseInt(dmyMatch[3], 10);
      return y >= 2000 && y <= 2099 && p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 31;
    }

    return false;
  };

  const parseDateValue = (val: unknown): Date | null => {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    const s = String(val).trim();
    if (!s || s === "-" || s === "N/A" || s === "null") return null;

    const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10) - 1;
      const d = parseInt(isoMatch[3], 10);
      const dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      const y = parseInt(dmyMatch[3], 10);
      let day = p1;
      let month = p2 - 1;
      if (p1 <= 12 && p2 > 12) {
        day = p2;
        month = p1 - 1;
      }
      const dt = new Date(y, month, day);
      return isNaN(dt.getTime()) ? null : dt;
    }

    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const detectedDateColumns = useMemo(() => {
    if (!headers.length || !data.length) return [];
    const sample = data.slice(0, 50);
    return headers.filter((h) => {
      const isNamedDate = /date|time|entry|update|inward|order|trans|style/i.test(h);
      let validCount = 0;
      let totalChecked = 0;
      for (const row of sample) {
        const val = row[h];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          totalChecked++;
          if (isStrictDateValue(val)) validCount++;
        }
      }
      if (totalChecked === 0) return isNamedDate;
      const ratio = validCount / totalChecked;
      return ratio >= 0.5 || (isNamedDate && validCount > 0);
    });
  }, [headers, data]);

  const activeDateColumn = useMemo(() => {
    if (selectedDateCol && detectedDateColumns.includes(selectedDateCol)) return selectedDateCol;
    if (dateInfo?.dateKey && detectedDateColumns.includes(dateInfo.dateKey)) return dateInfo.dateKey;
    return detectedDateColumns[0] || "";
  }, [selectedDateCol, detectedDateColumns, dateInfo]);

  const primaryFilteredColumns = useMemo(() => {
    const priorityKeywords = [
      "client",
      "clientname",
      "clientcity",
      "city",
      "statename",
      "state",
      "category",
      "categorygroup",
      "group",
      "order_customername",
      "customername",
      "salesperson",
      "salespersonname",
      "salespersonheadname",
      "basemetalclarity",
      "clarity",
      "purity",
      "bookaliasname",
      "stocktypealias",
      "stocktype",
      "billingtype",
      "locationname",
      "maketype",
      "branch",
    ];

    const results: string[] = [];
    headers.forEach((h) => {
      if (detectedDateColumns.includes(h)) return;
      const lower = h.toLowerCase().replace(/[\s_-]+/g, "");
      const isPriority = priorityKeywords.some((pk) => lower.includes(pk.replace(/[\s_-]+/g, "")));
      if (isPriority && !results.includes(h)) results.push(h);
    });

    headers.forEach((h) => {
      if (!detectedDateColumns.includes(h) && !results.includes(h) && results.length < 12) {
        results.push(h);
      }
    });

    return results;
  }, [headers, detectedDateColumns]);

  const getDistinctValues = (col: string): string[] => {
    const set = new Set<string>();
    data.forEach((r) => {
      const v = r[col];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== "-" && s !== "N/A" && s !== "null") set.add(s);
      }
    });
    return Array.from(set).sort();
  };

  const handleSaveCurrentFilter = (name: string) => {
    if (!name.trim()) return;
    const newPreset: SavedFilterPreset = {
      id: `preset_${Date.now()}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      searchQuery,
      columnFilters,
      selectedDateCol,
      startDate,
      endDate,
      fromOrderDateCol,
      toInwardDateCol,
      selectedColumns,
      currentGroupByField,
    };
    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    try {
      localStorage.setItem("sg_jewellery_saved_filters", JSON.stringify(updated));
    } catch {}
    setActivePresetId(newPreset.id);
    setIsSavePresetModalOpen(false);
    setNewPresetName("");
    showToast(`Filter preset "${name.trim()}" saved!`);
  };

  const handleApplyPreset = (preset: SavedFilterPreset) => {
    setSearchQuery(preset.searchQuery || "");
    setColumnFilters(preset.columnFilters || {});
    setSelectedDateCol(preset.selectedDateCol || "");
    setStartDate(preset.startDate || "");
    setEndDate(preset.endDate || "");
    if (preset.fromOrderDateCol) setFromOrderDateCol(preset.fromOrderDateCol);
    if (preset.toInwardDateCol) setToInwardDateCol(preset.toInwardDateCol);
    if (preset.selectedColumns && preset.selectedColumns.length > 0) {
      updateSelectedColumns(preset.selectedColumns);
    }
    if (preset.currentGroupByField) {
      setCurrentGroupByField(preset.currentGroupByField);
    }
    setActivePresetId(preset.id);
    setPage(1);
    showToast(`Applied preset: "${preset.name}"`);
  };

  const handleDeletePreset = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    try {
      localStorage.setItem("sg_jewellery_saved_filters", JSON.stringify(updated));
    } catch {}
    if (activePresetId === id) setActivePresetId(null);
    showToast("Filter preset deleted.");
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    Object.values(columnFilters).forEach((v) => {
      if (v && String(v).trim() !== "" && v !== "All") count++;
    });
    if (startDate) count++;
    if (endDate) count++;
    return count;
  }, [searchQuery, columnFilters, startDate, endDate]);

  // Overall Filtered Data (before drill-down)
  const filteredData = useMemo(() => {
    let list = (data || []).filter((row) => !isTotalSummaryRow(row));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((row) =>
        Object.values(row).some((val) => String(val ?? "").toLowerCase().includes(q))
      );
    }

    Object.entries(columnFilters).forEach(([colHeader, selectedVal]) => {
      if (selectedVal && selectedVal !== "All") {
        list = list.filter(
          (row) => String(row[colHeader] || "").trim().toLowerCase() === selectedVal.trim().toLowerCase()
        );
      }
    });

    if ((startDate || endDate) && activeDateColumn) {
      list = list.filter((row) => {
        const rowDateStr = String(row[activeDateColumn] || "").trim();
        if (!rowDateStr) return true;
        const rowDate = parseDateValue(rowDateStr);
        if (!rowDate) return true;
        const target = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()).getTime();

        if (startDate) {
          const s = parseDateValue(startDate);
          if (s) {
            const startLimit = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
            if (target < startLimit) return false;
          }
        }

        if (endDate) {
          const e = parseDateValue(endDate);
          if (e) {
            const endLimit = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
            if (target > endLimit) return false;
          }
        }

        return true;
      });
    }

    return list;
  }, [data, searchQuery, columnFilters, startDate, endDate, activeDateColumn]);

  // Drilled-Down Dataset (scoped to the current drillPath steps)
  const drilledDataset = useMemo(() => {
    let list = filteredData;
    drillPath.forEach((step) => {
      list = list.filter((row) => {
        const raw = row[step.groupKey];
        const str = raw !== undefined && raw !== null && String(raw).trim() !== "" ? String(raw).trim() : "Unassigned / Blank";
        return str.toLowerCase() === step.groupValue.toLowerCase();
      });
    });
    return list;
  }, [filteredData, drillPath]);

  const resetAllFilters = () => {
    setSearchQuery("");
    setColumnFilters({});
    setStartDate("");
    setEndDate("");
    setActivePresetId(null);
    setDrillPath([]);
    setCurrentGroupByField("");
    setPage(1);
    showToast("All filters and drill paths cleared.");
  };

  const effectiveOrderDateCol = useMemo(() => {
    if (fromOrderDateCol) return fromOrderDateCol;
    const priorityKeys = ["orderdate", "order_podate", "podate", "order", "styledate", "startdate"];
    for (const key of priorityKeys) {
      const match = headers.find((h) => h.toLowerCase().replace(/[\s_-]+/g, "").includes(key));
      if (match) return match;
    }
    return detectedDateColumns[0] || "";
  }, [headers, fromOrderDateCol, detectedDateColumns]);

  const effectiveInwardDateCol = useMemo(() => {
    if (toInwardDateCol) return toInwardDateCol;
    const priorityKeys = [
      "inwarddate",
      "inward",
      "deliverydate",
      "completedate",
      "dispatchdate",
      "receivedate",
      "closingdate",
    ];
    for (const key of priorityKeys) {
      const match = headers.find((h) => h.toLowerCase().replace(/[\s_-]+/g, "").includes(key));
      if (match && match !== effectiveOrderDateCol) return match;
    }
    const otherDateCols = detectedDateColumns.filter((c) => c !== effectiveOrderDateCol);
    return otherDateCols[0] || "";
  }, [headers, toInwardDateCol, detectedDateColumns, effectiveOrderDateCol]);

  // Auto-detect BaseMetal Column
  const autoBaseMetalCol = useMemo(() => {
    const patterns = [
      "basemetal",
      "base_metal",
      "metal",
      "metaltype",
      "goldtype",
      "purity",
      "karat",
    ];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Helper to extract costing from Category Master matching Category + BaseMetal variant
  const getCategoryCosting = (
    row: Record<string, any>
  ): { cost: number; matchedCat: string; matchedMetal?: string } => {
    if (!categoryMasterList || categoryMasterList.length === 0) return { cost: 0, matchedCat: "" };

    const rowMetalRaw = autoBaseMetalCol
      ? String(row[autoBaseMetalCol] || "").trim().toLowerCase()
      : "";

    const candidateKeys = [
      categoryKey,
      ...headers.filter((h) =>
        /category|item_?cat|product_?cat|item_?group|group|item_?type/i.test(h)
      ),
    ].filter(Boolean) as string[];

    for (const key of candidateKeys) {
      const rawVal = row[key];
      if (rawVal === undefined || rawVal === null) continue;
      const strVal = String(rawVal).trim();
      if (!strVal || strVal === "-" || strVal === "N/A" || strVal === "null") continue;

      const cleanRowCat = strVal.toLowerCase();
      const cleanRowCatAlpha = cleanRowCat.replace(/[^a-z0-9]/g, "");

      // 1. Dual Match: Exact Category AND Exact Base Metal
      if (rowMetalRaw) {
        const exactBoth = categoryMasterList.find((c) => {
          const catMatch = c.name && c.name.trim().toLowerCase() === cleanRowCat;
          const metalMatch = c.baseMetal && c.baseMetal.trim().toLowerCase() === rowMetalRaw;
          return catMatch && metalMatch;
        });
        if (exactBoth && exactBoth.costing !== undefined && exactBoth.costing !== null) {
          return {
            cost: Number(exactBoth.costing) || 0,
            matchedCat: exactBoth.name,
            matchedMetal: exactBoth.baseMetal,
          };
        }

        const cleanBoth = categoryMasterList.find((c) => {
          const catMatch = c.name && c.name.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanRowCatAlpha;
          const metalMatch =
            c.baseMetal &&
            c.baseMetal.toLowerCase().replace(/[^a-z0-9]/g, "") ===
              rowMetalRaw.replace(/[^a-z0-9]/g, "");
          return catMatch && metalMatch;
        });
        if (cleanBoth && cleanBoth.costing !== undefined && cleanBoth.costing !== null) {
          return {
            cost: Number(cleanBoth.costing) || 0,
            matchedCat: cleanBoth.name,
            matchedMetal: cleanBoth.baseMetal,
          };
        }
      }

      // 2. Exact category name match
      const exactCat = categoryMasterList.find(
        (c) => c.name && c.name.trim().toLowerCase() === cleanRowCat
      );
      if (exactCat && exactCat.costing !== undefined && exactCat.costing !== null) {
        return {
          cost: Number(exactCat.costing) || 0,
          matchedCat: exactCat.name,
          matchedMetal: exactCat.baseMetal,
        };
      }

      // 3. Normalized category name match
      const cleanCatMatch = categoryMasterList.find(
        (c) => c.name && c.name.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanRowCatAlpha
      );
      if (cleanCatMatch && cleanCatMatch.costing !== undefined && cleanCatMatch.costing !== null) {
        return {
          cost: Number(cleanCatMatch.costing) || 0,
          matchedCat: cleanCatMatch.name,
          matchedMetal: cleanCatMatch.baseMetal,
        };
      }
    }

    return { cost: 0, matchedCat: "" };
  };

  // Auto-detect BaseMetalClarity Column (BaseMetalClarity, not mfg)
  const autoBaseMetalClarityCol = useMemo(() => {
    const patterns = [
      "basemetalclarity",
      "base_metal_clarity",
      "metalclarity",
      "metal_clarity",
      "baseclarity",
      "basemetal",
      "clarity",
      "purity",
      "rate",
    ];
    // 1. Exact match excluding mfg
    for (const pat of patterns) {
      const found = headers.find((h) => {
        const clean = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        return !clean.includes("mfg") && clean === pat;
      });
      if (found) return found;
    }
    // 2. Contains match excluding mfg
    for (const pat of patterns) {
      const found = headers.find((h) => {
        const clean = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        return !clean.includes("mfg") && clean.includes(pat);
      });
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Auto-detect GrossWt Column
  const autoGrossWtCol = useMemo(() => {
    const patterns = ["grosswt", "gross_wt", "grossweight", "gross_weight", "grosswtb", "grosswt(b)", "gross"];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Auto-detect NetWt Column
  const autoNetWtCol = useMemo(() => {
    const patterns = [
      "netwtb",
      "netwt(b)",
      "netwt_b",
      "netwt",
      "net_wt",
      "netweight",
      "net_weight",
      "net_w",
      "netw",
      "net",
      "weight",
    ];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Auto-detect Act PureWt (B) Column
  const autoActPureWtCol = useMemo(() => {
    const patterns = [
      "actpurewtb",
      "actpurewt(b)",
      "actpurewt_b",
      "actpurewt",
      "act_pure_wt_b",
      "act_purewt",
      "actualpurewtb",
      "actualpurewt",
      "actualpurewt(b)",
    ];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Auto-detect PureWt Column
  const autoPureWtCol = useMemo(() => {
    const patterns = [
      "purewtb",
      "purewt(b)",
      "purewt_b",
      "purewt",
      "pure_wt",
      "pureweight",
      "pure_weight",
      "pure_w",
      "purew",
      "pure",
      "finewt",
      "fine_wt",
      "fine",
    ];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Auto-detect PureWt Plus Pure Loss Wt Column
  const autoPureWtPlusLossCol = useMemo(() => {
    const patterns = [
      "purewtpluspurelosswt",
      "purewt_plus_pure_loss_wt",
      "purewtpluslosswt",
      "purewtpluspureloss",
      "purewtplusloss",
      "pureplusloss",
      "purelosswt",
    ];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Auto-detect Tran vs Clarity Pure Wt Diff Column
  const autoTranVsClarityCol = useMemo(() => {
    const patterns = [
      "tranvsclaritypurewtdiff",
      "tran_vs_clarity_pure_wt_diff",
      "transvsclaritypurewtdiff",
      "tranvsclaritydiff",
      "claritypurewtdiff",
      "tranclaritydiff",
      "claritydiff",
    ];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  // Auto-detect TransPrice Column
  const autoTransPriceCol = useMemo(() => {
    const patterns = [
      "transprice",
      "trans_price",
      "transactionprice",
      "transaction_price",
      "transamount",
      "txprice",
      "tx_price",
      "price",
    ];
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === pat);
      if (found) return found;
    }
    for (const pat of patterns) {
      const found = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(pat));
      if (found) return found;
    }
    return "";
  }, [headers]);

  const parseNum = (val: any): number => {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const clean = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  // 1. Completed Order Days: InwardDate - OrderDate
  const getRowCompletedOrderDays = (row: Record<string, any>): number | null => {
    if (!effectiveOrderDateCol || !effectiveInwardDateCol) return null;
    const d1 = parseDateValue(row[effectiveOrderDateCol]);
    const d2 = parseDateValue(row[effectiveInwardDateCol]);
    if (d1 && d2) {
      const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 ? diff : null;
    }
    return null;
  };

  // 2. Net P&L: purewtplusepurelosswt - ((BaseMetalClarity + costing category) * netwt(b) / 100)
  const getRowActualProfit = (row: Record<string, any>): number => {
    const { cost: catCost } = getCategoryCosting(row);
    const clarity = autoBaseMetalClarityCol ? parseNum(row[autoBaseMetalClarityCol]) : 0;
    const netWt = autoNetWtCol ? parseNum(row[autoNetWtCol]) : 0;
    const pureLossWtCol = autoPureWtPlusLossCol || autoPureWtCol;
    const purePlusLossWt = pureLossWtCol ? parseNum(row[pureLossWtCol]) : 0;
    const firstVal = ((clarity + catCost) * netWt) / 100;
    return purePlusLossWt - firstVal;
  };

  // 3. Net %: (Net P&L / Act_PureWt (B)) * 100
  const getRowPercentage = (row: Record<string, any>): number | null => {
    const actPureCol = autoActPureWtCol || autoPureWtCol;
    const actPureWt = actPureCol ? parseNum(row[actPureCol]) : 0;
    if (Math.abs(actPureWt) < 0.00001 || isNaN(actPureWt)) return null;
    const profit = getRowActualProfit(row);
    return (profit / actPureWt) * 100;
  };

  // Aggregated Profit Stats across Drilled Dataset
  const profitSummaryStats = useMemo(() => {
    let totalProfit = 0;
    let totalActPure = 0;
    let sumPct = 0;
    let pctCount = 0;
    const actPureCol = autoActPureWtCol || autoPureWtCol;

    drilledDataset.forEach((row) => {
      const profit = getRowActualProfit(row);
      totalProfit += profit;
      if (actPureCol) {
        totalActPure += parseNum(row[actPureCol]);
      }
      const pct = getRowPercentage(row);
      if (pct !== null) {
        sumPct += pct;
        pctCount++;
      }
    });

    const avgProfit = drilledDataset.length > 0 ? totalProfit / drilledDataset.length : 0;
    const avgPct =
      Math.abs(totalActPure) > 0.0001
        ? (totalProfit / totalActPure) * 100
        : pctCount > 0
        ? sumPct / pctCount
        : 0;

    return {
      totalProfit,
      totalActPure,
      avgProfit,
      avgPct,
      pctCount,
    };
  }, [
    drilledDataset,
    categoryMasterList,
    categoryKey,
    headers,
    autoBaseMetalClarityCol,
    autoNetWtCol,
    autoActPureWtCol,
    autoPureWtCol,
    autoPureWtPlusLossCol,
    autoBaseMetalCol,
  ]);

  // Order to Inward Stats across Drilled Dataset
  const orderToInwardStats = useMemo(() => {
    const col1 = effectiveOrderDateCol;
    const col2 = effectiveInwardDateCol;
    if (!col1 || !col2 || col1 === col2 || !drilledDataset.length) {
      return {
        available: false,
        col1,
        col2,
        count: 0,
        totalDays: 0,
        avgDays: "N/A",
        minDays: null as number | null,
        maxDays: null as number | null,
      };
    }

    let totalDays = 0;
    let count = 0;
    let minDays: number | null = null;
    let maxDays: number | null = null;

    drilledDataset.forEach((row) => {
      const days = getRowCompletedOrderDays(row);
      if (days !== null) {
        totalDays += days;
        count++;
        if (minDays === null || days < minDays) minDays = days;
        if (maxDays === null || days > maxDays) maxDays = days;
      }
    });

    const avg = count > 0 ? (totalDays / count).toFixed(1) : "N/A";
    return {
      available: count > 0,
      col1,
      col2,
      count,
      totalDays,
      avgDays: avg,
      minDays,
      maxDays,
    };
  }, [drilledDataset, effectiveOrderDateCol, effectiveInwardDateCol]);

  // Dynamic Column-wise Sum & Aggregates across the entire drilled dataset (updates on filter & drill-down)
  const columnAggregates = useMemo(() => {
    const sums: Record<string, { isNumeric: boolean; sum: number; count: number; avg: number }> = {};

    visibleHeaders.forEach((header) => {
      let sum = 0;
      let validCount = 0;
      let numericCount = 0;

      for (const row of drilledDataset) {
        const val = row[header];
        if (val !== undefined && val !== null && String(val).trim() !== "" && val !== "-") {
          validCount++;
          const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ""));
          if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(String(val).trim())) {
            sum += num;
            numericCount++;
          }
        }
      }

      const isNumeric = validCount > 0 && numericCount / validCount >= 0.75;
      sums[header] = {
        isNumeric,
        sum,
        count: numericCount,
        avg: numericCount > 0 ? sum / numericCount : 0,
      };
    });

    return sums;
  }, [visibleHeaders, drilledDataset]);

  // Compute Single-Level Group Summaries when currentGroupByField is chosen
  const groupSummaries = useMemo<GroupSummaryItem[]>(() => {
    if (!currentGroupByField || drilledDataset.length === 0) return [];

    const map = new Map<string, Record<string, any>[]>();
    drilledDataset.forEach((row) => {
      const raw = row[currentGroupByField];
      const val =
        raw !== undefined && raw !== null && String(raw).trim() !== ""
          ? String(raw).trim()
          : "Unassigned / Blank";
      if (!map.has(val)) map.set(val, []);
      map.get(val)!.push(row);
    });

    const groupLabel = getDimensionDisplayLabel(currentGroupByField);
    const items: GroupSummaryItem[] = [];

    const sortedVals = Array.from(map.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    sortedVals.forEach((val) => {
      const rows = map.get(val)!;
      let totalGross = 0;
      let totalNet = 0;
      let totalActPure = 0;
      let totalPure = 0;
      let totalPurePlusLoss = 0;
      let totalTranVsClarity = 0;
      let totalTransPrice = 0;
      let totalProfit = 0;
      let sumPct = 0;
      let pctCount = 0;
      let sumDays = 0;
      let daysCount = 0;
      let minDays: number | null = null;
      let maxDays: number | null = null;

      rows.forEach((r) => {
        if (autoGrossWtCol) totalGross += parseNum(r[autoGrossWtCol]);
        if (autoNetWtCol) totalNet += parseNum(r[autoNetWtCol]);
        if (autoActPureWtCol) totalActPure += parseNum(r[autoActPureWtCol]);
        if (autoPureWtCol) totalPure += parseNum(r[autoPureWtCol]);
        if (autoPureWtPlusLossCol) totalPurePlusLoss += parseNum(r[autoPureWtPlusLossCol]);
        if (autoTranVsClarityCol) totalTranVsClarity += parseNum(r[autoTranVsClarityCol]);
        if (autoTransPriceCol) totalTransPrice += parseNum(r[autoTransPriceCol]);

        const prof = getRowActualProfit(r);
        totalProfit += prof;
        const pct = getRowPercentage(r);
        if (pct !== null) {
          sumPct += pct;
          pctCount++;
        }
        const days = getRowCompletedOrderDays(r);
        if (days !== null) {
          sumDays += days;
          daysCount++;
          if (minDays === null || days < minDays) minDays = days;
          if (maxDays === null || days > maxDays) maxDays = days;
        }
      });

      // Net % (formula base): (Total Net P&L / Total Act_PureWt (B)) * 100 if act_purewt != 0, else avg pct
      const formulaPct =
        Math.abs(totalActPure) > 0.0001
          ? (totalProfit / totalActPure) * 100
          : Math.abs(totalPure) > 0.0001
          ? (totalProfit / totalPure) * 100
          : pctCount > 0
          ? sumPct / pctCount
          : null;

      items.push({
        groupKey: currentGroupByField,
        groupLabel,
        groupValue: val,
        rowCount: rows.length,
        totalGrossWt: totalGross,
        totalNetWt: totalNet,
        totalActPureWt: totalActPure,
        totalPureWt: totalPure,
        totalPureWtPlusLoss: totalPurePlusLoss,
        totalTranVsClarityDiff: totalTranVsClarity,
        totalTransPrice: totalTransPrice,
        totalActualProfit: totalProfit,
        avgPercentage: formulaPct,
        avgCompletedOrderDays: daysCount > 0 ? sumDays / daysCount : null,
        minCompletedOrderDays: minDays,
        maxCompletedOrderDays: maxDays,
      });
    });

    return items;
  }, [
    drilledDataset,
    currentGroupByField,
    autoGrossWtCol,
    autoNetWtCol,
    autoActPureWtCol,
    autoPureWtCol,
    autoPureWtPlusLossCol,
    autoTranVsClarityCol,
    autoTransPriceCol,
    autoBaseMetalClarityCol,
    categoryMasterList,
    effectiveOrderDateCol,
    effectiveInwardDateCol,
  ]);

  // Sorted Group Summaries based on groupSortCol and groupSortOrder
  const sortedGroupSummaries = useMemo(() => {
    if (!groupSummaries.length) return [];
    const list = [...groupSummaries];
    const multiplier = groupSortOrder === "asc" ? 1 : -1;

    list.sort((a, b) => {
      if (groupSortCol === "groupValue") {
        return a.groupValue.localeCompare(b.groupValue, undefined, { numeric: true, sensitivity: "base" }) * multiplier;
      }
      if (groupSortCol === "rowCount") {
        return (a.rowCount - b.rowCount) * multiplier;
      }
      if (groupSortCol === "totalGrossWt") {
        return (a.totalGrossWt - b.totalGrossWt) * multiplier;
      }
      if (groupSortCol === "totalNetWt") {
        return (a.totalNetWt - b.totalNetWt) * multiplier;
      }
      if (groupSortCol === "totalActPureWt") {
        return (a.totalActPureWt - b.totalActPureWt) * multiplier;
      }
      if (groupSortCol === "totalPureWt") {
        return (a.totalPureWt - b.totalPureWt) * multiplier;
      }
      if (groupSortCol === "totalPureWtPlusLoss") {
        return (a.totalPureWtPlusLoss - b.totalPureWtPlusLoss) * multiplier;
      }
      if (groupSortCol === "totalTranVsClarityDiff") {
        return (a.totalTranVsClarityDiff - b.totalTranVsClarityDiff) * multiplier;
      }
      if (groupSortCol === "totalTransPrice") {
        return (a.totalTransPrice - b.totalTransPrice) * multiplier;
      }
      if (groupSortCol === "totalActualProfit") {
        return (a.totalActualProfit - b.totalActualProfit) * multiplier;
      }
      if (groupSortCol === "avgPercentage") {
        const p1 = a.avgPercentage ?? -Infinity;
        const p2 = b.avgPercentage ?? -Infinity;
        return (p1 - p2) * multiplier;
      }
      if (groupSortCol === "avgCompletedOrderDays") {
        const d1 = a.avgCompletedOrderDays ?? -Infinity;
        const d2 = b.avgCompletedOrderDays ?? -Infinity;
        return (d1 - d2) * multiplier;
      }
      return 0;
    });

    return list;
  }, [groupSummaries, groupSortCol, groupSortOrder]);

  // Drill Into a Specific Group
  const handleDrillIntoGroup = (item: GroupSummaryItem) => {
    setDrillPath((prev) => [
      ...prev,
      {
        groupKey: item.groupKey,
        groupLabel: item.groupLabel,
        groupValue: item.groupValue,
      },
    ]);
    setCurrentGroupByField(""); // Clear the group dropdown so user sees the filtered rows or selects the next group!
    setPage(1);
    showToast(`Drilled down into ${item.groupLabel}: "${item.groupValue}" (${item.rowCount} records)`);
  };

  // Navigate Back along Breadcrumbs
  const handleNavigateBreadcrumb = (index: number) => {
    if (index === -1) {
      setDrillPath([]);
    } else {
      setDrillPath((prev) => prev.slice(0, index + 1));
    }
    setPage(1);
  };

  const handleStepBackOneLevel = () => {
    if (drillPath.length > 0) {
      setDrillPath((prev) => prev.slice(0, prev.length - 1));
      setPage(1);
    }
  };

  // Sort Detailed Rows across all dataset columns and computed columns
  const sortedDetailedRows = useMemo(() => {
    if (!sortCol) return drilledDataset;

    const list = [...drilledDataset];
    const multiplier = sortOrder === "asc" ? 1 : -1;

    list.sort((a, b) => {
      // 1. Computed Column: Completed Order Days
      if (sortCol === "__completed_order_days") {
        const d1 = getRowCompletedOrderDays(a);
        const d2 = getRowCompletedOrderDays(b);
        if (d1 === null && d2 === null) return 0;
        if (d1 === null) return 1;
        if (d2 === null) return -1;
        return (d1 - d2) * multiplier;
      }

      // 2. Computed Column: Actual Profit
      if (sortCol === "__actual_profit") {
        const p1 = getRowActualProfit(a);
        const p2 = getRowActualProfit(b);
        return (p1 - p2) * multiplier;
      }

      // 3. Computed Column: Percentage
      if (sortCol === "__percentage") {
        const r1 = getRowPercentage(a);
        const r2 = getRowPercentage(b);
        if (r1 === null && r2 === null) return 0;
        if (r1 === null) return 1;
        if (r2 === null) return -1;
        return (r1 - r2) * multiplier;
      }

      // 4. Dynamic Column from Dataset
      const valA = a[sortCol];
      const valB = b[sortCol];

      if (
        (valA === undefined || valA === null || valA === "") &&
        (valB === undefined || valB === null || valB === "")
      ) {
        return 0;
      }
      if (valA === undefined || valA === null || valA === "") return 1;
      if (valB === undefined || valB === null || valB === "") return -1;

      // Check if Date Column
      if (detectedDateColumns.includes(sortCol) || isStrictDateValue(valA) || isStrictDateValue(valB)) {
        const dtA = parseDateValue(valA);
        const dtB = parseDateValue(valB);
        if (dtA && dtB) return (dtA.getTime() - dtB.getTime()) * multiplier;
        if (dtA) return -1 * multiplier;
        if (dtB) return 1 * multiplier;
      }

      // Check if Pure Numeric Value
      const sA = String(valA).trim();
      const sB = String(valB).trim();
      const numA = typeof valA === "number" ? valA : parseFloat(sA.replace(/[^0-9.-]/g, ""));
      const numB = typeof valB === "number" ? valB : parseFloat(sB.replace(/[^0-9.-]/g, ""));

      if (
        !isNaN(numA) &&
        !isNaN(numB) &&
        /^-?\d+(\.\d+)?$/.test(sA) &&
        /^-?\d+(\.\d+)?$/.test(sB)
      ) {
        return (numA - numB) * multiplier;
      }

      // Default: Natural string comparison
      return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
    });

    return list;
  }, [
    drilledDataset,
    sortCol,
    sortOrder,
    detectedDateColumns,
    categoryMasterList,
    autoBaseMetalClarityCol,
    autoNetWtCol,
    autoPureWtCol,
    effectiveOrderDateCol,
    effectiveInwardDateCol,
  ]);

  // Pagination for Detailed Flat View
  const totalPages = Math.ceil(sortedDetailedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    if (currentGroupByField) return [];
    const start = (page - 1) * pageSize;
    return sortedDetailedRows.slice(start, start + pageSize);
  }, [sortedDetailedRows, page, pageSize, currentGroupByField]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!drilledDataset.length) {
      showToast("No data to export.", undefined, "error");
      return;
    }

    const exportRows = drilledDataset.map((row, idx) => {
      const exportItem: Record<string, any> = {
        "Sr No": idx + 1,
      };

      // Add drill path info
      if (drillPath.length > 0) {
        drillPath.forEach((step, sIdx) => {
          exportItem[`Drill Level ${sIdx + 1} (${step.groupLabel})`] = step.groupValue;
        });
      }

      visibleHeaders.forEach((h) => {
        exportItem[h] = row[h] !== undefined && row[h] !== null ? row[h] : "";
      });

      const completedDays = getRowCompletedOrderDays(row);
      const actualProfit = getRowActualProfit(row);
      const percentage = getRowPercentage(row);

      exportItem["Completed Order Days"] = completedDays !== null ? completedDays : "";
      exportItem["Actual Profit (₹)"] = Number(actualProfit.toFixed(4));
      exportItem["Percentage (%)"] = percentage !== null ? Number(percentage.toFixed(4)) : "";

      return exportItem;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jewellery Transactions");

    const stamp = new Date().toISOString().slice(0, 10);
    const name = `Jewellery_Transactions_Report_${stamp}.xlsx`;
    XLSX.writeFile(workbook, name);

    showToast(`Exported ${exportRows.length.toLocaleString()} rows to Excel!`);
  };

  const modalFilteredHeaders = useMemo(() => {
    if (!columnSearchQuery.trim()) return headers;
    const q = columnSearchQuery.toLowerCase();
    return headers.filter((h) => h.toLowerCase().includes(q));
  }, [headers, columnSearchQuery]);

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-2xl p-4 text-xs font-semibold text-white shadow-2xl transition-all max-w-md ${
            toast.type === "success" ? "bg-[#18476A]" : "bg-rose-600"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={20} className="text-cyan-300 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-bold text-sm">{toast.message}</p>
            {toast.subMessage && (
              <p className="mt-1 text-slate-200 text-[11px] font-normal leading-relaxed">
                {toast.subMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#18476A]/10 dark:bg-[#18476A]/30 text-[#18476A] dark:text-cyan-400">
              <TableIcon size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#18476A] dark:text-cyan-400">
                  Jewellery Transaction
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Transaction Report
              </h1>
            </div>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Select a field to group by, click any group to explore its scoped transactions, and drill down step-by-step into sub-groups.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center shrink-0">
          <button
            onClick={() => {
              fetchTransactions();
              fetchCategoryMaster();
            }}
            disabled={loading}
            title="Refresh transaction data"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          {canExport && data.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              <span>Export Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Performance & Profit Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Filtered Records Count */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
              {drillPath.length > 0 ? "Drill-Down Scope" : "Active Records"}
            </span>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {drilledDataset.length.toLocaleString()}
            </h3>
            <span className="text-[10px] text-slate-400 block">
              of {data.length.toLocaleString()} total dataset entries
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 text-[#18476A] dark:text-cyan-400">
            <Layers size={22} />
          </div>
        </div>

        {/* 2. Total Actual Profit */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Total Actual Profit
            </span>
            <h3
              className={`text-2xl font-black ${
                profitSummaryStats.totalProfit >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              ₹{profitSummaryStats.totalProfit.toLocaleString("en-IN", {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
            </h3>
            <span className="text-[10px] text-slate-400 block">
              Avg: ₹{profitSummaryStats.avgProfit.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / order
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <IndianRupee size={22} />
          </div>
        </div>

        {/* 3. Average Profit Percentage */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Avg Profit Margin
            </span>
            <h3 className="text-2xl font-black text-purple-600 dark:text-purple-400">
              {profitSummaryStats.avgPct.toFixed(4)}%
            </h3>
            <span className="text-[10px] text-slate-400 block">
              Calculated over {profitSummaryStats.pctCount} valid rows
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <Percent size={22} />
          </div>
        </div>

        {/* 4. Order -> Inward Average Days */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Avg Lead Time
            </span>
            <h3 className="text-2xl font-black text-[#18476A] dark:text-cyan-300">
              {orderToInwardStats.avgDays !== "N/A" ? `${orderToInwardStats.avgDays} Days` : "N/A"}
            </h3>
            <span className="text-[10px] text-slate-400 block">
              {orderToInwardStats.count} matched lead time records
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Timer size={22} />
          </div>
        </div>
      </div>

      {/* GUIDED SINGLE-FIELD GROUP-BY & DRILL-DOWN CONTROL BAR */}
      {data.length > 0 && (
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left: Group By Field Dropdown Selector */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-white">
                <FolderTree size={17} className="text-[#18476A] dark:text-cyan-400" />
                <span>Group By Field:</span>
              </div>

              {/* The Single Selectable Group Dropdown */}
              <div className="relative min-w-[260px]">
                <select
                  value={currentGroupByField}
                  onChange={(e) => {
                    setCurrentGroupByField(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-3.5 pr-8 py-2.5 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-[#18476A]/40 dark:border-cyan-500/40 text-[#18476A] dark:text-cyan-300 focus:outline-hidden focus:ring-2 focus:ring-[#18476A] cursor-pointer shadow-2xs"
                >
                  <option value="">None (Show All Detailed Transaction Rows)</option>
                  {availableGroupOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {currentGroupByField && (
                <button
                  onClick={() => setCurrentGroupByField("")}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Show Detail Rows
                </button>
              )}
            </div>

            {/* Right: Reset / Step Back Controls */}
            {drillPath.length > 0 && (
              <div className="flex items-center gap-2 self-start md:self-auto">
                <button
                  onClick={handleStepBackOneLevel}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shadow-2xs"
                >
                  <ArrowLeft size={13} />
                  <span>Back 1 Level</span>
                </button>
                <button
                  onClick={() => {
                    setDrillPath([]);
                    setCurrentGroupByField("");
                    setPage(1);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 transition cursor-pointer shadow-2xs"
                >
                  <X size={13} />
                  <span>Clear All Drill-Down</span>
                </button>
              </div>
            )}
          </div>

          {/* Interactive Breadcrumb Navigation Trail */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/80 text-xs">
            <button
              onClick={() => handleNavigateBreadcrumb(-1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                drillPath.length === 0
                  ? "bg-[#18476A] text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <Home size={13} />
              <span>All Transactions ({filteredData.length.toLocaleString()})</span>
            </button>

            {drillPath.map((step, sIdx) => {
              const isLast = sIdx === drillPath.length - 1;

              return (
                <Fragment key={`${step.groupKey}-${sIdx}`}>
                  <span className="text-slate-400 font-bold px-0.5">&rarr;</span>
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition ${
                      isLast
                        ? "bg-[#18476A] text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                    }`}
                    onClick={() => !isLast && handleNavigateBreadcrumb(sIdx)}
                  >
                    <span className="text-[10px] text-amber-300 font-extrabold uppercase">
                      {step.groupLabel}:
                    </span>
                    <span>{step.groupValue}</span>
                    {isLast && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigateBreadcrumb(sIdx - 1);
                        }}
                        title="Exit this drill level"
                        className="ml-1 p-0.5 rounded-full hover:bg-white/20 transition cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* FILTER PANEL */}
      {data.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-850/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#18476A]/10 text-[#18476A] dark:text-cyan-400">
                <Filter size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Data Filters & Date Range</span>
                  {activeFiltersCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#18476A] text-white">
                      {activeFiltersCount} Active
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Refine dataset records before grouping or exporting.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              {activeFiltersCount > 0 && (
                <button
                  onClick={resetAllFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Reset Filters</span>
                </button>
              )}

              <button
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                {isFilterPanelOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
          </div>

          {isFilterPanelOpen && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                {/* Global Search Box */}
                <div className="lg:col-span-4 space-y-1.5">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Keyword Search
                  </label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Search across all fields..."
                      className="w-full pl-9 pr-8 py-2.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A] transition"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setPage(1);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Date Filter & Presets */}
                <div className="lg:col-span-8 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Date Range Filter
                    </label>
                    {detectedDateColumns.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="text-[10px] font-semibold">Column:</span>
                        {detectedDateColumns.length === 1 ? (
                          <span className="text-[11px] font-bold text-[#18476A] dark:text-cyan-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-mono border border-slate-200/80 dark:border-slate-700">
                            {detectedDateColumns[0]}
                          </span>
                        ) : (
                          <select
                            value={activeDateColumn}
                            onChange={(e) => setSelectedDateCol(e.target.value)}
                            className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-[#18476A] dark:text-cyan-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 focus:outline-hidden cursor-pointer"
                          >
                            {detectedDateColumns.map((col) => (
                              <option key={col} value={col}>
                                {col}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs flex-1 min-w-[240px]">
                      <Calendar size={14} className="text-slate-400 shrink-0" />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setPage(1);
                        }}
                        className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden text-xs w-full cursor-pointer"
                      />
                      <span className="text-slate-400 font-bold text-xs shrink-0 px-1 select-none">
                        to
                      </span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setPage(1);
                        }}
                        className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden text-xs w-full cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                      <button
                        onClick={() => {
                          const today = new Date().toISOString().split("T")[0];
                          setStartDate(today);
                          setEndDate(today);
                          setPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 transition cursor-pointer"
                      >
                        Today
                      </button>
                      <button
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 7);
                          setStartDate(d.toISOString().split("T")[0]);
                          setEndDate(new Date().toISOString().split("T")[0]);
                          setPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 transition cursor-pointer"
                      >
                        Last 7D
                      </button>
                      <button
                        onClick={() => {
                          const d = new Date();
                          d.setDate(1);
                          setStartDate(d.toISOString().split("T")[0]);
                          setEndDate(new Date().toISOString().split("T")[0]);
                          setPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 transition cursor-pointer"
                      >
                        This Month
                      </button>
                      {(startDate || endDate) && (
                        <button
                          onClick={() => {
                            setStartDate("");
                            setEndDate("");
                            setPage(1);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 transition cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Field Filters */}
              {primaryFilteredColumns.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                    Quick Filter By Field:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {primaryFilteredColumns.map((col) => {
                      const values = getDistinctValues(col);
                      const currentVal = columnFilters[col] || "All";

                      return (
                        <div key={col} className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate" title={col}>
                            {col}
                          </label>
                          <select
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setColumnFilters((prev) => ({
                                ...prev,
                                [col]: val === "All" ? "" : val,
                              }));
                              setPage(1);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer truncate"
                          >
                            <option value="All">All ({values.length})</option>
                            {values.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table Toolbar & View Controls */}
      {data.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {currentGroupByField ? (
              <span>
                Grouped by <strong className="text-slate-900 dark:text-white font-bold">{getDimensionDisplayLabel(currentGroupByField)}</strong> ({groupSummaries.length} groups found)
              </span>
            ) : (
              <span>
                Showing <strong className="text-slate-900 dark:text-white font-bold">{drilledDataset.length.toLocaleString()}</strong> detailed records (page {page} of {totalPages})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!currentGroupByField && (
              <>
                <button
                  onClick={() => setIsColumnModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shadow-2xs"
                  title={`Customized for: ${currentContextLabel}`}
                >
                  <SlidersHorizontal size={14} className="text-[#18476A] dark:text-cyan-400" />
                  <span>
                    Customize Columns ({visibleHeaders.length}/{headers.length})
                  </span>
                  {drillPath.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#18476A]/10 dark:bg-cyan-950 text-[#18476A] dark:text-cyan-300 font-mono font-black border border-[#18476A]/20 dark:border-cyan-800/30">
                      {drillPath[drillPath.length - 1].groupValue}
                    </span>
                  )}
                </button>

                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-hidden"
                >
                  <option value="25">25 rows / page</option>
                  <option value="50">50 rows / page</option>
                  <option value="100">100 rows / page</option>
                  <option value="250">250 rows / page</option>
                </select>
              </>
            )}
          </div>
        </div>
      )}

      {/* DATA TABLE (Summary List or Detailed Ledger) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <div className="inline-flex items-center gap-2 font-bold text-sm">
              <RefreshCw size={18} className="animate-spin text-[#18476A]" />
              <span>Loading dynamic jewellery transaction data...</span>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 sm:p-16 text-center space-y-4">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#18476A]/10 text-[#18476A] dark:text-cyan-400">
              <Coins size={32} />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                No Transaction Records Available
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                To view transaction reports and profit calculations, upload your Excel dataset from the Master management section.
              </p>
            </div>
            <button
              onClick={() => navigate("/master/jewellery-transactions")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-extrabold transition shadow-lg shadow-[#18476A]/20 cursor-pointer"
            >
              <span>Go to Master to Upload Dataset</span>
              <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <div>
            {/* VIEW A: SUMMARY GROUP LIST (when currentGroupByField is chosen) */}
            {currentGroupByField ? (
              <div className="overflow-x-auto max-h-[640px] custom-scrollbar border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-slate-900 shadow-xs">
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {/* 1. Index # Column (Sticky Left) */}
                      <th className="px-3.5 py-3.5 w-14 min-w-[56px] text-center whitespace-nowrap sticky left-0 z-40 bg-slate-100 dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-700">
                        #
                      </th>
                      
                      {/* 2. Group Name Column (Sticky Left) */}
                      <th
                        onClick={() => handleGroupSort("groupValue")}
                        className="px-4 py-3.5 min-w-[240px] cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition whitespace-nowrap sticky left-14 z-40 bg-slate-100 dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span>{getDimensionDisplayLabel(currentGroupByField)}</span>
                          {groupSortCol === "groupValue" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 3. Total Records */}
                      <th
                        onClick={() => handleGroupSort("rowCount")}
                        className="px-4 py-3.5 min-w-[130px] text-center whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Total Records</span>
                          {groupSortCol === "rowCount" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 4. Grosswt */}
                      <th
                        onClick={() => handleGroupSort("totalGrossWt")}
                        className="px-4 py-3.5 min-w-[120px] text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Grosswt</span>
                          {groupSortCol === "totalGrossWt" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 5. Netwt */}
                      <th
                        onClick={() => handleGroupSort("totalNetWt")}
                        className="px-4 py-3.5 min-w-[120px] text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Netwt</span>
                          {groupSortCol === "totalNetWt" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 6. Act purewt(b) */}
                      <th
                        onClick={() => handleGroupSort("totalActPureWt")}
                        className="px-4 py-3.5 min-w-[135px] text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Act purewt(b)</span>
                          {groupSortCol === "totalActPureWt" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 7. Purewt (b) */}
                      <th
                        onClick={() => handleGroupSort("totalPureWt")}
                        className="px-4 py-3.5 min-w-[120px] text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Purewt (b)</span>
                          {groupSortCol === "totalPureWt" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 8. Purewtpluspurelosswt */}
                      <th
                        onClick={() => handleGroupSort("totalPureWtPlusLoss")}
                        className="px-4 py-3.5 min-w-[190px] text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Purewtpluspurelosswt</span>
                          {groupSortCol === "totalPureWtPlusLoss" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 9. Tranvsclaritypurewtdiff */}
                      <th
                        onClick={() => handleGroupSort("totalTranVsClarityDiff")}
                        className="px-4 py-3.5 min-w-[200px] text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Tranvsclaritypurewtdiff</span>
                          {groupSortCol === "totalTranVsClarityDiff" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 10. Transprice */}
                      <th
                        onClick={() => handleGroupSort("totalTransPrice")}
                        className="px-4 py-3.5 min-w-[140px] text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Transprice</span>
                          {groupSortCol === "totalTransPrice" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-slate-400/60 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 11. Completed order days */}
                      <th
                        onClick={() => handleGroupSort("avgCompletedOrderDays")}
                        className="px-4 py-3.5 min-w-[180px] text-right whitespace-nowrap bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 font-extrabold cursor-pointer select-none hover:bg-emerald-200 dark:hover:bg-emerald-900 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Completed order days</span>
                          {groupSortCol === "avgCompletedOrderDays" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-emerald-800 dark:text-emerald-200 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-emerald-800 dark:text-emerald-200 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-emerald-700/50 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 12. Net p&l */}
                      <th
                        onClick={() => handleGroupSort("totalActualProfit")}
                        className="px-4 py-3.5 min-w-[140px] text-right whitespace-nowrap bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-300 font-extrabold cursor-pointer select-none hover:bg-indigo-200 dark:hover:bg-indigo-900 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Net p&l</span>
                          {groupSortCol === "totalActualProfit" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-indigo-800 dark:text-indigo-200 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-indigo-800 dark:text-indigo-200 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-indigo-700/50 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 13. Net % */}
                      <th
                        onClick={() => handleGroupSort("avgPercentage")}
                        className="px-4 py-3.5 min-w-[110px] text-right whitespace-nowrap bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 font-extrabold cursor-pointer select-none hover:bg-purple-200 dark:hover:bg-purple-900 transition"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Net %</span>
                          {groupSortCol === "avgPercentage" ? (
                            groupSortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-purple-800 dark:text-purple-200 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-purple-800 dark:text-purple-200 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-purple-700/50 shrink-0" />
                          )}
                        </div>
                      </th>

                      {/* 14. Explore Action (Sticky Right) */}
                      <th className="px-4 py-3.5 min-w-[140px] text-center whitespace-nowrap sticky right-0 z-40 bg-slate-100 dark:bg-slate-900 border-l border-slate-200/80 dark:border-slate-700 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 bg-white dark:bg-slate-800/40">
                    {sortedGroupSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="px-6 py-14 text-center text-slate-400">
                          No matching group records found.
                        </td>
                      </tr>
                    ) : (
                      sortedGroupSummaries.map((item, idx) => (
                        <tr
                          key={item.groupValue}
                          onClick={() => handleDrillIntoGroup(item)}
                          className="hover:bg-slate-50/90 dark:hover:bg-slate-750/70 transition duration-150 cursor-pointer group"
                        >
                          {/* 1. Index (Sticky Left) */}
                          <td className="px-3.5 py-3.5 text-center font-mono font-bold text-slate-400 sticky left-0 z-20 bg-white group-hover:bg-slate-50 dark:bg-slate-800 dark:group-hover:bg-slate-750 border-r border-slate-200/60 dark:border-slate-700/60">
                            {idx + 1}
                          </td>

                          {/* 2. Group Value & Badge (Sticky Left) */}
                          <td className="px-4 py-3.5 whitespace-nowrap sticky left-14 z-20 bg-white group-hover:bg-slate-50 dark:bg-slate-800 dark:group-hover:bg-slate-750 border-r border-slate-200/60 dark:border-slate-700/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-[#18476A] dark:group-hover:text-cyan-300 transition whitespace-nowrap">
                                {item.groupValue}
                              </span>
                              <span className="shrink-0 whitespace-nowrap text-[10px] px-2 py-0.5 rounded-md bg-[#18476A]/10 dark:bg-cyan-950/40 text-[#18476A] dark:text-cyan-300 font-bold border border-[#18476A]/20 dark:border-cyan-800/30">
                                {item.groupLabel}
                              </span>
                            </div>
                          </td>

                          {/* 3. Total Records */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <span className="inline-block min-w-[40px] px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono">
                              {item.rowCount.toLocaleString()}
                            </span>
                          </td>

                          {/* 4. Grosswt */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {item.totalGrossWt !== 0 ? `${item.totalGrossWt.toFixed(4)}` : "-"}
                          </td>

                          {/* 5. Netwt */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {item.totalNetWt !== 0 ? `${item.totalNetWt.toFixed(4)}` : "-"}
                          </td>

                          {/* 6. Act purewt(b) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {item.totalActPureWt !== 0 ? `${item.totalActPureWt.toFixed(4)}` : "-"}
                          </td>

                          {/* 7. Purewt (b) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {item.totalPureWt !== 0 ? `${item.totalPureWt.toFixed(4)}` : "-"}
                          </td>

                          {/* 8. Purewtpluspurelosswt */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {item.totalPureWtPlusLoss !== 0 ? `${item.totalPureWtPlusLoss.toFixed(4)}` : "-"}
                          </td>

                          {/* 9. Tranvsclaritypurewtdiff */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {item.totalTranVsClarityDiff !== 0 ? `${item.totalTranVsClarityDiff.toFixed(4)}` : "-"}
                          </td>

                          {/* 10. Transprice */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {item.totalTransPrice !== 0 ? `₹${item.totalTransPrice.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : "-"}
                          </td>

                          {/* 11. Completed order days */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap bg-emerald-50/30 dark:bg-emerald-950/20">
                            {item.avgCompletedOrderDays !== null ? (
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-emerald-700 dark:text-emerald-300">
                                <Timer size={12} className="text-emerald-600 dark:text-emerald-400" />
                                {item.avgCompletedOrderDays.toFixed(1)} {item.avgCompletedOrderDays === 1 ? "Day" : "Days"}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>

                          {/* 12. Net p&l */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap bg-emerald-50/40 dark:bg-emerald-950/20">
                            <span
                              className={`font-mono font-black text-xs ${
                                item.totalActualProfit >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              ₹{item.totalActualProfit.toLocaleString("en-IN", {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })}
                            </span>
                          </td>

                          {/* 13. Net % */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap bg-purple-50/40 dark:bg-purple-950/20">
                            {item.avgPercentage !== null ? (
                              <span className="font-mono font-black text-xs text-purple-600 dark:text-purple-400">
                                {item.avgPercentage.toFixed(4)}%
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>

                          {/* 14. Explore Button (Sticky Right) */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap sticky right-0 z-20 bg-white group-hover:bg-slate-50 dark:bg-slate-800 dark:group-hover:bg-slate-750 border-l border-slate-200/60 dark:border-slate-700/60 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDrillIntoGroup(item);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-xs cursor-pointer"
                            >
                              <span>Explore ({item.rowCount})</span>
                              <ChevronRight size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {/* Dynamic Summary Total Footer for Group View */}
                  {sortedGroupSummaries.length > 0 && (
                    <tfoot className="sticky bottom-0 z-30 bg-slate-100 dark:bg-slate-900 border-t-2 border-slate-300 dark:border-slate-600 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                      <tr className="text-xs font-black text-slate-900 dark:text-white">
                        {/* 1. Total (Sticky Left) */}
                        <td className="px-3.5 py-3.5 text-center font-extrabold text-[#18476A] dark:text-cyan-400 sticky left-0 z-40 bg-slate-100 dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
                          Total
                        </td>

                        {/* 2. Group Count Label (Sticky Left) */}
                        <td className="px-4 py-3.5 text-left text-xs font-black text-[#18476A] dark:text-cyan-400 whitespace-nowrap sticky left-14 z-40 bg-slate-100 dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Overall Total ({sortedGroupSummaries.length} Groups)
                        </td>

                        {/* 3. Total Records */}
                        <td className="px-4 py-3.5 text-center font-black whitespace-nowrap">
                          <span className="inline-block min-w-[40px] px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-mono">
                            {drilledDataset.length.toLocaleString()}
                          </span>
                        </td>

                        {/* 4. Grosswt */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black">
                          {(() => {
                            let total = 0;
                            if (autoGrossWtCol) drilledDataset.forEach((r) => (total += parseNum(r[autoGrossWtCol])));
                            return total !== 0 ? total.toFixed(4) : "-";
                          })()}
                        </td>

                        {/* 5. Netwt */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black">
                          {(() => {
                            let total = 0;
                            if (autoNetWtCol) drilledDataset.forEach((r) => (total += parseNum(r[autoNetWtCol])));
                            return total !== 0 ? total.toFixed(4) : "-";
                          })()}
                        </td>

                        {/* 6. Act purewt(b) */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black">
                          {(() => {
                            let total = 0;
                            if (autoActPureWtCol) drilledDataset.forEach((r) => (total += parseNum(r[autoActPureWtCol])));
                            return total !== 0 ? total.toFixed(4) : "-";
                          })()}
                        </td>

                        {/* 7. Purewt (b) */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black">
                          {(() => {
                            let total = 0;
                            if (autoPureWtCol) drilledDataset.forEach((r) => (total += parseNum(r[autoPureWtCol])));
                            return total !== 0 ? total.toFixed(4) : "-";
                          })()}
                        </td>

                        {/* 8. Purewtpluspurelosswt */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black">
                          {(() => {
                            let total = 0;
                            if (autoPureWtPlusLossCol) drilledDataset.forEach((r) => (total += parseNum(r[autoPureWtPlusLossCol])));
                            return total !== 0 ? total.toFixed(4) : "-";
                          })()}
                        </td>

                        {/* 9. Tranvsclaritypurewtdiff */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black">
                          {(() => {
                            let total = 0;
                            if (autoTranVsClarityCol) drilledDataset.forEach((r) => (total += parseNum(r[autoTranVsClarityCol])));
                            return total !== 0 ? total.toFixed(4) : "-";
                          })()}
                        </td>

                        {/* 10. Transprice */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black">
                          {(() => {
                            let total = 0;
                            if (autoTransPriceCol) drilledDataset.forEach((r) => (total += parseNum(r[autoTransPriceCol])));
                            return total !== 0 ? `₹${total.toLocaleString("en-IN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : "-";
                          })()}
                        </td>

                        {/* 11. Completed order days */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100/50 dark:bg-emerald-950/40">
                          {orderToInwardStats.avgDays !== "N/A" ? (
                            <span className="inline-flex items-center gap-1">
                              <Timer size={12} className="text-emerald-600 dark:text-emerald-400" />
                              Avg: {orderToInwardStats.avgDays}d
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>

                        {/* 12. Net p&l */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-950/40">
                          ₹{profitSummaryStats.totalProfit.toLocaleString("en-IN", {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}
                        </td>

                        {/* 13. Net % */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black text-purple-600 dark:text-purple-400 bg-purple-100/50 dark:bg-purple-950/40">
                          {(() => {
                            const actPureCol = autoActPureWtCol || autoPureWtCol;
                            let totalActPure = 0;
                            if (actPureCol) drilledDataset.forEach((r) => (totalActPure += parseNum(r[actPureCol])));
                            const overallPct =
                              Math.abs(totalActPure) > 0.0001
                                ? (profitSummaryStats.totalProfit / totalActPure) * 100
                                : profitSummaryStats.avgPct;
                            return `${overallPct.toFixed(4)}%`;
                          })()}
                        </td>

                        {/* 14. Sticky Right Blank */}
                        <td className="px-4 py-3.5 text-center sticky right-0 z-40 bg-slate-100 dark:bg-slate-900 border-l border-slate-200/80 dark:border-slate-700 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              /* VIEW B: DETAILED TRANSACTION ROWS (when currentGroupByField is empty/none) */
              <div className="overflow-x-auto max-h-[640px] custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 shadow-xs">
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      <th className="px-3.5 py-3.5 min-w-[60px] w-16 text-center whitespace-nowrap sticky left-0 z-30 bg-slate-100 dark:bg-slate-900 shadow-[1px_0_0_#e2e8f0] dark:shadow-[1px_0_0_#334155]">
                        #
                      </th>
                      {visibleHeaders.map((header) => {
                        const isCategoryCol =
                          categoryKey &&
                          header.trim().toLowerCase() === categoryKey.trim().toLowerCase();
                        return (
                          <th
                            key={header}
                            onClick={() => handleSort(header)}
                            className={`px-4 py-3.5 whitespace-nowrap cursor-pointer select-none bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 transition ${
                              isCategoryCol
                                ? "!bg-amber-100 dark:!bg-amber-950 text-amber-900 dark:text-amber-300 font-extrabold"
                                : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span>{header}</span>
                                {isCategoryCol && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-500 text-white font-bold">
                                    Category
                                  </span>
                                )}
                              </div>
                              {sortCol === header ? (
                                sortOrder === "asc" ? (
                                  <ArrowUp size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                                ) : (
                                  <ArrowDown size={13} className="text-[#18476A] dark:text-cyan-400 shrink-0 font-bold" />
                                )
                              ) : (
                                <ArrowUpDown size={12} className="text-slate-400/50 shrink-0" />
                              )}
                            </div>
                          </th>
                        );
                      })}

                      {/* 3 Computed Performance & Profit Headers with Sorting */}
                      <th
                        onClick={() => handleSort("__completed_order_days")}
                        className="px-4 py-3.5 whitespace-nowrap bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 font-extrabold border-l border-slate-200 dark:border-slate-700 cursor-pointer select-none hover:bg-emerald-200 dark:hover:bg-emerald-900 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Timer size={14} className="text-emerald-600 dark:text-emerald-400" />
                            <span>Completed Order Days</span>
                          </div>
                          {sortCol === "__completed_order_days" ? (
                            sortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-emerald-800 dark:text-emerald-200 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-emerald-800 dark:text-emerald-200 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-emerald-700/50 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th
                        onClick={() => handleSort("__actual_profit")}
                        className="px-4 py-3.5 whitespace-nowrap bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-300 font-extrabold cursor-pointer select-none hover:bg-indigo-200 dark:hover:bg-indigo-900 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <IndianRupee size={14} className="text-indigo-600 dark:text-indigo-400" />
                            <span>Net p&l</span>
                          </div>
                          {sortCol === "__actual_profit" ? (
                            sortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-indigo-800 dark:text-indigo-200 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-indigo-800 dark:text-indigo-200 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-indigo-700/50 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th
                        onClick={() => handleSort("__percentage")}
                        className="px-4 py-3.5 whitespace-nowrap bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 font-extrabold cursor-pointer select-none hover:bg-purple-200 dark:hover:bg-purple-900 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Percent size={14} className="text-purple-600 dark:text-purple-400" />
                            <span>Net %</span>
                          </div>
                          {sortCol === "__percentage" ? (
                            sortOrder === "asc" ? (
                              <ArrowUp size={13} className="text-purple-800 dark:text-purple-200 shrink-0 font-bold" />
                            ) : (
                              <ArrowDown size={13} className="text-purple-800 dark:text-purple-200 shrink-0 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="text-purple-700/50 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th className="px-4 py-3.5 text-center whitespace-nowrap min-w-[70px] sticky right-0 z-30 bg-slate-100 dark:bg-slate-900 shadow-[-1px_0_0_#e2e8f0] dark:shadow-[-1px_0_0_#334155]">
                        View
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={visibleHeaders.length + 5} className="px-6 py-14 text-center text-slate-400">
                          <Filter size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
                            No transaction records match the selected filters
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Try resetting or broadening your filter criteria.</p>
                          <button
                            onClick={resetAllFilters}
                            className="mt-3 px-4 py-1.5 rounded-xl bg-[#18476A] text-white text-xs font-bold transition cursor-pointer"
                          >
                            Reset All Filters
                          </button>
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, index) => {
                        const globalIndex = (page - 1) * pageSize + index + 1;
                        const completedDays = getRowCompletedOrderDays(row);
                        const actualProfit = getRowActualProfit(row);
                        const profitPct = getRowPercentage(row);

                        return (
                          <tr
                            key={index}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-750/50 transition duration-100"
                          >
                            <td className="px-3.5 py-3 text-center whitespace-nowrap font-mono font-bold text-slate-400 dark:text-slate-500 sticky left-0 z-10 bg-white dark:bg-slate-800 shadow-[1px_0_0_#e2e8f0] dark:shadow-[1px_0_0_#334155]">
                              {globalIndex}
                            </td>
                            {visibleHeaders.map((header) => {
                              const val = row[header];
                              const isCategoryCol =
                                categoryKey &&
                                header.trim().toLowerCase() === categoryKey.trim().toLowerCase();

                              return (
                                <td
                                  key={header}
                                  className={`px-4 py-3 whitespace-nowrap text-slate-800 dark:text-slate-200 font-medium ${
                                    isCategoryCol
                                      ? "font-bold text-[#18476A] dark:text-cyan-400 bg-amber-50/40 dark:bg-amber-950/20"
                                      : ""
                                  }`}
                                >
                                  {val !== undefined && val !== null && String(val).trim() !== "" ? (
                                    String(val)
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600">-</span>
                                  )}
                                </td>
                              );
                            })}

                            {/* 1. Completed Order Days */}
                            <td className="px-4 py-3 whitespace-nowrap font-semibold bg-emerald-50/30 dark:bg-emerald-950/20 border-l border-slate-100 dark:border-slate-800">
                              {completedDays !== null ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold font-mono">
                                  <Timer size={12} className="text-emerald-600 dark:text-emerald-400" />
                                  {completedDays} {completedDays === 1 ? "Day" : "Days"}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                              )}
                            </td>

                            {/* 2. Actual Profit */}
                            <td className="px-4 py-3 whitespace-nowrap font-semibold bg-indigo-50/30 dark:bg-indigo-950/20">
                              {(() => {
                                const { cost: catCost, matchedCat, matchedMetal } = getCategoryCosting(row);
                                const clarity = autoBaseMetalClarityCol ? parseNum(row[autoBaseMetalClarityCol]) : 0;
                                const netWt = autoNetWtCol ? parseNum(row[autoNetWtCol]) : 0;
                                const pureLossWtCol = autoPureWtPlusLossCol || autoPureWtCol;
                                const purePlusLossWt = pureLossWtCol ? parseNum(row[pureLossWtCol]) : 0;
                                const metalNote = matchedMetal ? ` (${matchedMetal})` : "";
                                const tooltip = `Net P&L: PureWt+Loss (${purePlusLossWt.toFixed(4)}) - ((Clarity: ${clarity} + CatCost: ₹${catCost}${metalNote}) × NetWt: ${netWt} / 100) = ₹${actualProfit.toFixed(4)}`;

                                return (
                                  <span
                                    title={tooltip}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100/80 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-xs font-black font-mono cursor-help"
                                  >
                                    <IndianRupee size={12} className="text-indigo-600 dark:text-indigo-400" />
                                    {actualProfit.toLocaleString("en-IN", {
                                      minimumFractionDigits: 4,
                                      maximumFractionDigits: 4,
                                    })}
                                  </span>
                                );
                              })()}
                            </td>

                            {/* 3. Percentage */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-semibold bg-purple-50/30 dark:bg-purple-950/20">
                              {(() => {
                                const actPureCol = autoActPureWtCol || autoPureWtCol;
                                const pureWt = actPureCol ? parseNum(row[actPureCol]) : 0;
                                const tooltip =
                                  profitPct !== null
                                    ? `Actual Profit (${actualProfit.toFixed(4)}) / Act_PureWt (${pureWt.toFixed(4)}) * 100 = ${profitPct.toFixed(4)}%`
                                    : "Act_PureWt is missing or 0";

                                return profitPct !== null ? (
                                  <span
                                    title={tooltip}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-100/80 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 text-xs font-black font-mono cursor-help"
                                  >
                                    <Percent size={12} className="text-purple-600 dark:text-purple-400" />
                                    {profitPct.toFixed(4)}%
                                  </span>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">-</span>
                                );
                              })()}
                            </td>

                            <td className="px-4 py-3 text-right sticky right-0 z-10 bg-white dark:bg-slate-800 shadow-[-1px_0_0_#e2e8f0] dark:shadow-[-1px_0_0_#334155]">
                              <button
                                onClick={() => setSelectedRow(row)}
                                title="View Full Record"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                              >
                                <Eye size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* Dynamic Sticky Summary / Total Footer Row for Detailed View */}
                  {drilledDataset.length > 0 && (
                    <tfoot className="sticky bottom-0 z-20 bg-slate-100 dark:bg-slate-900 border-t-2 border-slate-300 dark:border-slate-600 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                      <tr className="text-xs font-black text-slate-900 dark:text-white">
                        <td className="px-3.5 py-3.5 text-center sticky left-0 z-30 bg-slate-100 dark:bg-slate-900 shadow-[1px_0_0_#cbd5e1] dark:shadow-[1px_0_0_#475569]">
                          <span className="text-[10px] uppercase font-extrabold text-[#18476A] dark:text-cyan-400">Total</span>
                        </td>
                        {visibleHeaders.map((header, hIdx) => {
                          const agg = columnAggregates[header];
                          if (hIdx === 0 && (!agg || !agg.isNumeric)) {
                            return (
                              <td key={header} className="px-4 py-3.5 whitespace-nowrap">
                                <span className="text-xs font-extrabold text-[#18476A] dark:text-cyan-400">
                                  Total ({drilledDataset.length.toLocaleString()} rows)
                                </span>
                              </td>
                            );
                          }
                          if (agg && agg.isNumeric) {
                            return (
                              <td key={header} className="px-4 py-3.5 whitespace-nowrap font-mono font-black text-slate-900 dark:text-white bg-slate-200/50 dark:bg-slate-800/60">
                                {agg.sum.toLocaleString("en-IN", {
                                  minimumFractionDigits: agg.sum % 1 !== 0 ? 3 : 0,
                                  maximumFractionDigits: 3,
                                })}
                              </td>
                            );
                          }
                          return (
                            <td key={header} className="px-4 py-3.5 whitespace-nowrap text-slate-400 font-mono">
                              -
                            </td>
                          );
                        })}

                        {/* 1. Dynamic Avg Completed Order Days */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono font-black bg-emerald-200/60 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border-l border-slate-300 dark:border-slate-600">
                          {orderToInwardStats.avgDays !== "N/A" ? (
                            <span>Avg: {orderToInwardStats.avgDays}d</span>
                          ) : (
                            "-"
                          )}
                        </td>

                        {/* 2. Dynamic Total Actual Profit */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono font-black bg-indigo-200/60 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200">
                          <span>
                            ₹{profitSummaryStats.totalProfit.toLocaleString("en-IN", {
                              minimumFractionDigits: 4,
                              maximumFractionDigits: 4,
                            })}
                          </span>
                        </td>

                        {/* 3. Dynamic Avg Percentage */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono font-black bg-purple-200/60 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200">
                          <span>Avg: {profitSummaryStats.avgPct.toFixed(4)}%</span>
                        </td>

                        <td className="px-4 py-3.5 sticky right-0 z-30 bg-slate-100 dark:bg-slate-900 shadow-[-1px_0_0_#cbd5e1] dark:shadow-[-1px_0_0_#475569]"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Pagination Controls (Flat View Only) */}
            {!currentGroupByField && drilledDataset.length > pageSize && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-850">
                <span className="text-xs font-semibold text-slate-500">
                  Showing {(page - 1) * pageSize + 1} to{" "}
                  {Math.min(page * pageSize, drilledDataset.length)} of {drilledDataset.length} entries (Viewing {visibleHeaders.length} columns)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-bold px-3 py-1 bg-[#18476A] text-white rounded-lg">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manage Columns Modal */}
      {isColumnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg max-h-[85vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-850 shrink-0">
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal size={18} className="text-[#18476A] dark:text-cyan-400" />
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Customize Visible Columns
                  </h3>
                  <p className="text-[11px] text-[#18476A] dark:text-cyan-300 font-bold mt-0.5 flex items-center gap-1">
                    <span>Applied to:</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-[#18476A]/10 dark:bg-cyan-950 font-mono text-[#18476A] dark:text-cyan-300">
                      {currentContextLabel}
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsColumnModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={columnSearchQuery}
                  onChange={(e) => setColumnSearchQuery(e.target.value)}
                  placeholder="Filter column names..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllColumns}
                    className="text-[#18476A] dark:text-cyan-400 hover:underline font-bold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={deselectAllColumns}
                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>

                <button
                  onClick={selectFirst20Columns}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition cursor-pointer"
                >
                  First 20
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-1">
              {modalFilteredHeaders.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No columns match "{columnSearchQuery}"
                </div>
              ) : (
                modalFilteredHeaders.map((header) => {
                  const isChecked = selectedColumns.includes(header);
                  const isCategoryCol =
                    categoryKey &&
                    header.trim().toLowerCase() === categoryKey.trim().toLowerCase();

                  return (
                    <label
                      key={header}
                      onClick={() => toggleColumn(header)}
                      className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-medium cursor-pointer transition select-none ${
                        isChecked
                          ? "bg-slate-100/80 dark:bg-slate-800/80 text-slate-900 dark:text-white"
                          : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        {isChecked ? (
                          <CheckSquare size={16} className="text-[#18476A] dark:text-cyan-400 shrink-0" />
                        ) : (
                          <Square size={16} className="text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{header}</span>
                      </div>
                      {isCategoryCol && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20 shrink-0">
                          Category
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 shrink-0">
              <span className="text-xs text-slate-500">
                {selectedColumns.length} of {headers.length} columns displayed
              </span>
              <button
                onClick={() => setIsColumnModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row Detail Inspector Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-850 shrink-0">
              <div className="flex items-center gap-2">
                <TableIcon size={18} className="text-[#18476A] dark:text-cyan-400" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Transaction Record Details
                </h3>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {(() => {
                const { cost: catCost, matchedCat, matchedMetal } = getCategoryCosting(selectedRow);
                const clarity = autoBaseMetalClarityCol ? parseNum(selectedRow[autoBaseMetalClarityCol]) : 0;
                const netWt = autoNetWtCol ? parseNum(selectedRow[autoNetWtCol]) : 0;
                const pureWt = autoPureWtCol ? parseNum(selectedRow[autoPureWtCol]) : 0;
                const pureLossWtCol = autoPureWtPlusLossCol || autoPureWtCol;
                const purePlusLossWt = pureLossWtCol ? parseNum(selectedRow[pureLossWtCol]) : 0;
                const firstVal = ((clarity + catCost) * netWt) / 100;
                const actualProfit = getRowActualProfit(selectedRow);
                const profitPct = getRowPercentage(selectedRow);
                const completedDays = getRowCompletedOrderDays(selectedRow);

                return (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-[#18476A] to-slate-900 text-white space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                          Calculated Performance & Profit Metrics
                        </span>
                      </div>
                      {matchedCat && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black">
                          Category: {matchedCat} {matchedMetal ? `(${matchedMetal})` : ""}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      {/* 1. Completed Order Days */}
                      <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-1 flex items-center gap-1">
                          <Timer size={12} />
                          <span>Completed Order Days</span>
                        </span>
                        <div className="text-lg font-black text-white">
                          {completedDays !== null ? `${completedDays} Days` : "N/A"}
                        </div>
                        <span className="text-[10px] text-slate-300 block mt-0.5">
                          InwardDate &minus; OrderDate
                        </span>
                      </div>

                      {/* 2. Actual Profit / Net P&L */}
                      <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block mb-1 flex items-center gap-1">
                          <IndianRupee size={12} />
                          <span>Net P&L</span>
                        </span>
                        <div className="text-lg font-black text-white">
                          ₹{actualProfit.toLocaleString("en-IN", {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}
                        </div>
                        <span className="text-[10px] text-indigo-200 block mt-0.5 truncate" title={`${purePlusLossWt.toFixed(4)} - ((${clarity} + ${catCost}) * ${netWt} / 100) = ${actualProfit.toFixed(4)}`}>
                          {purePlusLossWt.toFixed(4)} &minus; (({clarity} + {catCost}) &times; {netWt} / 100)
                        </span>
                      </div>

                      {/* 3. Percentage */}
                      <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 block mb-1 flex items-center gap-1">
                          <Percent size={12} />
                          <span>Percentage</span>
                        </span>
                        <div className="text-lg font-black text-white">
                          {profitPct !== null ? `${profitPct.toFixed(4)}%` : "N/A"}
                        </div>
                        <span className="text-[10px] text-purple-200 block mt-0.5 truncate">
                          Profit ({actualProfit.toFixed(4)}) / Act_PureWt ({pureWt.toFixed(4)}) &times; 100
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {headers.map((h) => {
                  const val = selectedRow[h];
                  const isCategoryCol =
                    categoryKey &&
                    h.trim().toLowerCase() === categoryKey.trim().toLowerCase();

                  return (
                    <div
                      key={h}
                      className={`p-3 rounded-xl border ${
                        isCategoryCol
                          ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/60"
                      }`}
                    >
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                        {h} {isCategoryCol && "★ (Category)"}
                      </span>
                      <p className="font-bold text-slate-900 dark:text-white break-words">
                        {val !== undefined && val !== null && String(val).trim() !== "" ? (
                          String(val)
                        ) : (
                          <span className="text-slate-400 font-normal italic">None</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 shrink-0">
              <button
                onClick={() => setSelectedRow(null)}
                className="px-5 py-2 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
