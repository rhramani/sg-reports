import { Router, Request, Response } from "express";
import { JewelleryTransactionReportModel } from "../models/JewelleryTransaction";
import { CategoryModel } from "../models/Category";
import { AuditLogModel } from "../models/AuditLog";

export const jewelleryTransactionsRouter = Router();

// Helper to find category column key in row data
function findCategoryKey(headers: string[], sampleRow?: Record<string, any>): string | null {
  const directMatch = headers.find((h) => h.trim().toLowerCase() === "category");
  if (directMatch) return directMatch;

  if (sampleRow && typeof sampleRow === "object") {
    const rowDirectMatch = Object.keys(sampleRow).find((k) => k.trim().toLowerCase() === "category");
    if (rowDirectMatch) return rowDirectMatch;
  }

  const possibleKeys = [
    "category",
    "item_category",
    "itemcategory",
    "category_name",
    "categoryname",
    "product_category",
    "productcategory",
    "cat",
    "item_cat",
    "category name",
    "item category",
  ];

  for (const h of headers) {
    const norm = h.trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (possibleKeys.some((pk) => pk.replace(/[\s_-]+/g, "") === norm)) {
      return h;
    }
  }

  if (sampleRow && typeof sampleRow === "object") {
    for (const key of Object.keys(sampleRow)) {
      const norm = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
      if (possibleKeys.some((pk) => pk.replace(/[\s_-]+/g, "") === norm)) {
        return key;
      }
    }
  }

  return null;
}

// Helper to find base metal column key in row data
function findBaseMetalKey(headers: string[], sampleRow?: Record<string, any>): string | null {
  const directMatch = headers.find(
    (h) =>
      h.trim().toLowerCase() === "basemetal" ||
      h.trim().toLowerCase() === "base metal" ||
      h.trim().toLowerCase() === "metal"
  );
  if (directMatch) return directMatch;

  if (sampleRow && typeof sampleRow === "object") {
    const rowMatch = Object.keys(sampleRow).find(
      (k) =>
        k.trim().toLowerCase() === "basemetal" ||
        k.trim().toLowerCase() === "base metal" ||
        k.trim().toLowerCase() === "metal"
    );
    if (rowMatch) return rowMatch;
  }

  const possible = ["basemetal", "base metal", "metal", "metaltype", "goldtype", "base_metal"];
  for (const h of headers) {
    const norm = h.trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (possible.some((p) => p.replace(/[\s_-]+/g, "") === norm)) return h;
  }

  if (sampleRow && typeof sampleRow === "object") {
    for (const key of Object.keys(sampleRow)) {
      const norm = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
      if (possible.some((pk) => pk.replace(/[\s_-]+/g, "") === norm)) {
        return key;
      }
    }
  }

  return null;
}

// Helper to compute a normalized row fingerprint for duplicate detection
function getRowFingerprint(row: Record<string, any>): string {
  if (!row || typeof row !== "object") return "";

  // Check for common primary keys (Order #, SKU, Invoice #, etc.)
  const pkFields = ["order_orderno", "orderno", "invoiceno", "invoice_no", "voucherno", "voucher_no", "inwardskuno", "skuno", "id"];
  for (const [k, v] of Object.entries(row)) {
    const normK = k.toLowerCase().replace(/[\s_-]+/g, "");
    if (pkFields.includes(normK) && v !== undefined && v !== null && String(v).trim()) {
      // Fingerprint combines primary key with other fields
      return `${normK}:${String(v).trim().toLowerCase()}_` + Object.entries(row)
        .filter(([key]) => key !== k)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${key.toLowerCase().trim()}=${String(val ?? "").trim().toLowerCase()}`)
        .join("|");
    }
  }

  // Fallback: Full normalized content fingerprint
  return Object.entries(row)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase().trim()}=${String(v ?? "").trim().toLowerCase()}`)
    .join("|");
}

// Helper to detect static summary/total rows from uploaded Excel sheets
function isTotalRow(row: Record<string, any>): boolean {
  if (!row || typeof row !== "object") return false;

  const entries = Object.entries(row);
  if (entries.length === 0) return false;

  let hyphenCount = 0;
  let numCount = 0;
  let hasTotalKeyword = false;
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
      hasTotalKeyword = true;
    }

    if (str === "-" || str === "–" || str === "—" || lower === "n/a" || lower === "null") {
      hyphenCount++;
    } else if (typeof val === "number" || (!isNaN(Number(str)) && str !== "-")) {
      numCount++;
    } else if (isStrictDateString(val)) {
      hasValidDate = true;
    }

    const normKey = key.toLowerCase().replace(/[\s_-]+/g, "");
    if (
      normKey.includes("category") ||
      normKey.includes("customer") ||
      normKey.includes("client") ||
      normKey.includes("salesperson")
    ) {
      if (str !== "-" && str !== "–" && str !== "—" && lower !== "total" && lower !== "n/a") {
        hasValidCategoryOrCustomer = true;
      }
    }
  }

  // 1. Direct total keyword found anywhere
  if (hasTotalKeyword) return true;

  // 2. Hyphenated summary row with numbers and missing primary business fields
  if (!hasValidCategoryOrCustomer && (numCount > 0 || hyphenCount > 0)) {
    return true;
  }

  // 3. Row with 3+ hyphens
  if (hyphenCount >= 3) return true;

  return false;
}

// Helper to validate genuine date strings (rejects voucher/transaction numbers like RIR/26-27/0049/1 or IN/1771/1)
function isStrictDateString(val: unknown): boolean {
  if (!val) return false;
  const s = String(val).trim();
  if (s.length < 6 || s.length > 30) return false;

  // Reject alphanumeric strings unless standard 3-letter month name is present
  if (/[a-zA-Z]/.test(s)) {
    const hasMonth = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(s);
    if (!hasMonth) return false;
  }

  const slashes = (s.match(/\//g) || []).length;
  const dashes = (s.match(/-/g) || []).length;
  const dots = (s.match(/\./g) || []).length;
  if (slashes !== 2 && dashes !== 2 && dots !== 2) return false;

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(T.*)?$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    return y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  // DD-MM-YYYY or MM-DD-YYYY
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const p1 = parseInt(dmy[1], 10);
    const p2 = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    return y >= 2000 && y <= 2099 && p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 31;
  }

  return false;
}

// Detect representative date range for dashboard and header badges
function detectReportDateRange(
  headers: string[],
  data: Record<string, any>[]
): { dateKey: string | null; dateDisplay: string | null; minDate?: string; maxDate?: string } {
  if (!headers.length || !data.length) {
    return { dateKey: null, dateDisplay: null };
  }

  // Find candidate date column
  let dateKey: string | null = null;
  const priorityKeys = ["orderdate", "order_podate", "podate", "inwarddate", "styledate", "date", "entrydate"];

  for (const pk of priorityKeys) {
    const match = headers.find((h) => h.toLowerCase().replace(/[\s_-]+/g, "").includes(pk));
    if (match) {
      dateKey = match;
      break;
    }
  }

  if (!dateKey) {
    const sampleRows = data.slice(0, 30);
    for (const h of headers) {
      let validCount = 0;
      for (const row of sampleRows) {
        if (row[h] && isStrictDateString(row[h])) {
          validCount++;
        }
      }
      if (validCount >= Math.min(3, sampleRows.length)) {
        dateKey = h;
        break;
      }
    }
  }

  if (!dateKey || data.length === 0) {
    return { dateKey: null, dateDisplay: null };
  }

  const rawDates: string[] = [];
  data.forEach((row) => {
    const val = row[dateKey!];
    if (val !== undefined && val !== null) {
      const str = String(val).trim();
      if (str && str !== "-" && str !== "N/A" && str !== "null" && isStrictDateString(str)) {
        rawDates.push(str);
      }
    }
  });

  if (rawDates.length === 0) {
    return { dateKey, dateDisplay: null };
  }

  const uniqueDates = Array.from(new Set(rawDates));
  if (uniqueDates.length === 1) {
    return { dateKey, dateDisplay: uniqueDates[0], minDate: uniqueDates[0], maxDate: uniqueDates[0] };
  }

  const sortedDates = [...uniqueDates].sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];

  return {
    dateKey,
    dateDisplay: `${minDate} to ${maxDate}`,
    minDate,
    maxDate,
  };
}

// GET latest or all jewellery transaction reports
jewelleryTransactionsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const report = await JewelleryTransactionReportModel.findOne().sort({ createdAt: -1 });

    if (!report) {
      return res.json({
        success: true,
        data: [],
        headers: [],
        total: 0,
        reportInfo: null,
      });
    }

    // Clean out any static Excel summary/total rows
    const baseData = (report.data || []).filter((r) => !isTotalRow(r));

    // If report in MongoDB contained dirty total rows, save the cleaned dataset back to MongoDB immediately
    if (baseData.length !== (report.data || []).length) {
      report.data = baseData;
      report.rowCount = baseData.length;
      await report.save();
    }

    const { search, category, page = "1", limit = "100" } = req.query;
    let filteredData = baseData;

    // Filter by search query across all fields
    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredData = filteredData.filter((row) =>
        Object.values(row).some((val) =>
          String(val ?? "").toLowerCase().includes(q)
        )
      );
    }

    // Filter by category if category filter applied
    if (category && typeof category === "string" && category !== "All") {
      const catKey = findCategoryKey(report.headers, baseData[0]);
      if (catKey) {
        filteredData = filteredData.filter(
          (row) => String(row[catKey] || "").trim().toLowerCase() === category.trim().toLowerCase()
        );
      }
    }

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.max(1, parseInt(String(limit), 10) || 100);
    const totalFiltered = filteredData.length;
    const paginatedData = filteredData.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // Extract unique categories from dataset
    const catKey = findCategoryKey(report.headers, baseData[0]);
    const uniqueCategories: string[] = [];
    if (catKey) {
      const set = new Set<string>();
      baseData.forEach((row) => {
        const val = row[catKey];
        if (val && typeof val === "string" && val.trim()) {
          set.add(val.trim());
        }
      });
      uniqueCategories.push(...Array.from(set));
    }

    // Detect report date information from actual data
    const dateRangeInfo = detectReportDateRange(report.headers, baseData);
    const totalCategoriesInMaster = await CategoryModel.countDocuments();

    res.json({
      success: true,
      data: paginatedData,
      allRows: filteredData,
      headers: report.headers || [],
      total: totalFiltered,
      totalRaw: baseData.length,
      uniqueCategories,
      categoryKey: catKey,
      dateInfo: dateRangeInfo,
      totalMasterCategories: totalCategoriesInMaster,
      reportInfo: {
        _id: report._id,
        reportName: report.reportName,
        sourceFile: report.sourceFile,
        rowCount: baseData.length,
        uploadedBy: report.uploadedBy,
        uploadedAt: report.createdAt,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      },
    });
  } catch (error) {
    console.error("GET /api/jewellery-transactions error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch jewellery transactions" });
  }
});

// POST upload and insert Excel dynamic transaction data & sync unique categories
// (With smart deduplication: inserts new/different entries, skips existing identical entries)
jewelleryTransactionsRouter.post("/upload", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const { fileName, headers, data, reportName } = body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ success: false, error: "No data rows provided in uploaded sheet." });
    }

    // 0. Filter out static Excel Total / Grand Total summary footer rows
    const sanitizedIncoming = data.filter((r) => !isTotalRow(r));
    if (sanitizedIncoming.length === 0) {
      return res.status(400).json({ success: false, error: "Uploaded sheet contains no valid transaction rows (only summary rows detected)." });
    }

    const safeHeaders: string[] =
      Array.isArray(headers) && headers.length > 0
        ? headers
        : Object.keys(sanitizedIncoming[0] || {});

    const user = (req as any).user;
    const uploadedBy = user?.name || user?.email || "Admin";

    // 1. Check existing report in MongoDB to perform deduplication
    const existingReport = await JewelleryTransactionReportModel.findOne().sort({ createdAt: -1 });

    let finalRows: Record<string, any>[] = [];
    let combinedHeaders: string[] = [...safeHeaders];
    let newRowsInserted = 0;
    let duplicateRowsSkipped = 0;

    if (existingReport && Array.isArray(existingReport.data) && existingReport.data.length > 0) {
      // Clean existing rows of any total rows
      const existingCleaned = existingReport.data.filter((r) => !isTotalRow(r));

      // Build set of existing row fingerprints
      const existingFingerprints = new Set<string>();
      existingCleaned.forEach((row) => {
        const fp = getRowFingerprint(row);
        if (fp) existingFingerprints.add(fp);
      });

      finalRows = [...existingCleaned];

      // Merge headers
      (existingReport.headers || []).forEach((h) => {
        if (!combinedHeaders.includes(h)) combinedHeaders.push(h);
      });

      // Check each row in incoming data: insert if different/new, skip if identical
      sanitizedIncoming.forEach((incomingRow) => {
        const fp = getRowFingerprint(incomingRow);
        if (existingFingerprints.has(fp)) {
          duplicateRowsSkipped++;
        } else {
          existingFingerprints.add(fp);
          finalRows.push(incomingRow);
          newRowsInserted++;
        }
      });

      // Update existing document in MongoDB
      existingReport.reportName = reportName || fileName || existingReport.reportName;
      existingReport.sourceFile = fileName || existingReport.sourceFile;
      existingReport.headers = combinedHeaders;
      existingReport.data = finalRows;
      existingReport.rowCount = finalRows.length;
      existingReport.uploadedBy = uploadedBy;
      await existingReport.save();
    } else {
      // First upload: insert all valid rows
      finalRows = sanitizedIncoming;
      newRowsInserted = sanitizedIncoming.length;

      await JewelleryTransactionReportModel.create({
        reportName: reportName || fileName || "Jewellery Transactions",
        sourceFile: fileName || "uploaded_sheet.xlsx",
        headers: safeHeaders,
        data: finalRows,
        rowCount: finalRows.length,
        uploadedBy,
      });
    }

    // 2. Extract unique (Category + BaseMetal) combinations and sync to Category Master
    const catKey = findCategoryKey(combinedHeaders, finalRows[0]);
    const metalKey = findBaseMetalKey(combinedHeaders, finalRows[0]);
    let newCategoriesCreated = 0;
    const categoriesFound: string[] = [];

    if (catKey) {
      const pairsMap = new Map<string, { name: string; baseMetal: string }>();
      finalRows.forEach((row) => {
        const c = String(row[catKey] || "").trim();
        const m = metalKey ? String(row[metalKey] || "").trim() : "";
        if (c && c !== "-" && c !== "N/A" && c !== "null") {
          const key = `${c.toLowerCase()}__${m.toLowerCase()}`;
          if (!pairsMap.has(key)) {
            pairsMap.set(key, { name: c, baseMetal: m });
          }
        }
      });

      for (const { name: catName, baseMetal: metalVal } of pairsMap.values()) {
        categoriesFound.push(metalVal ? `${catName} (${metalVal})` : catName);

        const escapedName = catName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedMetal = metalVal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const existing = await CategoryModel.findOne({
          name: { $regex: new RegExp(`^${escapedName}$`, "i") },
          baseMetal: { $regex: new RegExp(`^${escapedMetal}$`, "i") },
        });

        if (!existing) {
          await CategoryModel.create({
            name: catName,
            baseMetal: metalVal,
            description: metalVal ? `Auto-imported from ${fileName || "Excel"} (${metalVal})` : `Auto-imported from ${fileName || "Excel"}`,
            costing: 0,
          });
          newCategoriesCreated++;
        }
      }
    }

    // 3. Detect date range inside the report
    const dateRangeInfo = detectReportDateRange(combinedHeaders, finalRows);

    // 4. Log into Audit Logs
    if (user) {
      AuditLogModel.create({
        sessionId: `tx-up-${Date.now()}`,
        userName: user.name || "Admin",
        userEmail: user.email || "admin@sgreport.com",
        userRole: user.role || "Super Admin",
        loginTime: new Date().toISOString(),
        status: "Completed",
        totalActions: 1,
        timeline: [
          {
            timestamp: new Date().toISOString(),
            module: "Jewellery Transaction",
            section: "Transaction Report Upload",
            action: "Add",
            details: `Uploaded Excel "${fileName}": ${newRowsInserted} new entries inserted, ${duplicateRowsSkipped} duplicate rows skipped. Total in ledger: ${finalRows.length}.`,
          },
        ],
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message:
        newRowsInserted > 0
          ? `Inserted ${newRowsInserted} new entries (${duplicateRowsSkipped} duplicate rows skipped). ${newCategoriesCreated} new unique categories synced.`
          : `All ${duplicateRowsSkipped} entries are already in the database (0 duplicates added). All categories are up to date.`,
      newRowsInserted,
      duplicateRowsSkipped,
      totalRows: finalRows.length,
      categoryKey: catKey,
      categoriesFound,
      newCategoriesCreated,
      dateInfo: dateRangeInfo,
    });
  } catch (error: any) {
    console.error("POST /api/jewellery-transactions/upload error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to upload transaction data." });
  }
});

// DELETE clear all or specific uploaded transaction dataset
jewelleryTransactionsRouter.delete("/", async (_req: Request, res: Response) => {
  try {
    await JewelleryTransactionReportModel.deleteMany({});
    res.json({ success: true, message: "Jewellery transaction report data cleared successfully." });
  } catch (error: any) {
    console.error("DELETE /api/jewellery-transactions error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to clear transaction data." });
  }
});
