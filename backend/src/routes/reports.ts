import { Router } from "express";
import { getDBStatus } from "../db";
import { ReportModel } from "../models/Report";
import { ReportItem, HeaderStructure } from "@shared/api";
import { AuthRequest } from "../middleware/auth";
import { logActivity } from "../utils/auditLogger";
import { syncReportTypes } from "../utils/reportTypeSyncer";

export const reportsRouter = Router();

// GET /api/reports — List all reports with dynamic database filtering
reportsRouter.get("/", async (req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const { startDate, endDate, type, owner, status, search } = req.query;
    const queryFilter: Record<string, unknown> = {};

    if (type && typeof type === "string" && type.trim() && type !== "All") {
      const cleanType = type.trim();
      queryFilter.$or = [
        { type: { $regex: cleanType, $options: "i" } },
        { name: { $regex: cleanType, $options: "i" } },
      ];
    }

    if (owner && typeof owner === "string" && owner.trim() && owner !== "All") {
      queryFilter.owner = { $regex: owner.trim(), $options: "i" };
    }

    if (status && typeof status === "string" && status.trim() && status !== "All") {
      queryFilter.status = status.trim();
    }

    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim();
      const searchOr = [
        { name: { $regex: q, $options: "i" } },
        { type: { $regex: q, $options: "i" } },
        { owner: { $regex: q, $options: "i" } },
      ];
      if (queryFilter.$or) {
        queryFilter.$and = [{ $or: queryFilter.$or as unknown[] }, { $or: searchOr }];
        delete queryFilter.$or;
      } else {
        queryFilter.$or = searchOr;
      }
    }

    if (startDate || endDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (startDate && typeof startDate === "string" && startDate.trim()) {
        createdAtFilter.$gte = new Date(`${startDate.trim()}T00:00:00.000Z`);
      }
      if (endDate && typeof endDate === "string" && endDate.trim()) {
        createdAtFilter.$lte = new Date(`${endDate.trim()}T23:59:59.999Z`);
      }
      queryFilter.createdAt = createdAtFilter;
    }

    const reports = await ReportModel.find(queryFilter).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: reports,
      message: "Reports retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/reports/filters/options — Dynamic filter choices from DB (supports date range)
reportsRouter.get("/filters/options", async (req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const { startDate, endDate } = req.query;
    const queryFilter: Record<string, unknown> = {};

    if (startDate || endDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (startDate && typeof startDate === "string" && startDate.trim()) {
        createdAtFilter.$gte = new Date(`${startDate.trim()}T00:00:00.000Z`);
      }
      if (endDate && typeof endDate === "string" && endDate.trim()) {
        createdAtFilter.$lte = new Date(`${endDate.trim()}T23:59:59.999Z`);
      }
      queryFilter.createdAt = createdAtFilter;
    }

    const types = await ReportModel.distinct("type", queryFilter);
    const names = await ReportModel.distinct("name", queryFilter);
    const owners = await ReportModel.distinct("owner", queryFilter);
    const statuses = ["Pending", "Approved", "Review", "Inactive"];

    const combinedTypes = Array.from(
      new Set(
        [...types, ...names]
          .filter((t): t is string => typeof t === "string" && Boolean(t.trim()))
          .map((t) => t.trim())
      )
    ).sort();

    const cleanOwners = Array.from(
      new Set(
        owners
          .filter((o): o is string => typeof o === "string" && Boolean(o.trim()))
          .map((o) => o.trim())
      )
    ).sort();

    res.json({
      success: true,
      data: {
        types: combinedTypes,
        owners: cleanOwners,
        statuses,
      },
      message: "Report filter options retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/reports/:id — Single report
reportsRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const report = await ReportModel.findOne({
      $or: [{ _id: id }, { reportId: id }],
    });

    if (!report) {
      return res.status(404).json({ success: false, error: "Requested report was not found." });
    }

    res.json({
      success: true,
      data: report,
      message: "Report details retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/reports — Create report
reportsRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { name, type, source, owner, data, headers, headerStructure } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Report name is required.",
      });
    }

    const cleanName = name.trim();
    const reportId = `REP-${Date.now().toString(36).toUpperCase()}`;

    // Enrich melting report data with Purity field structure before saving to DB
    const enriched = enrichMeltingReportPurity(
      cleanName,
      headers || [],
      data || [],
      headerStructure
    );

    const reportObj: ReportItem = {
      reportId,
      name: cleanName,
      type: cleanName,
      source: source || "Spreadsheet Upload",
      owner: owner?.trim() || "Unknown",
      status: "Pending",
      rowsCount: Array.isArray(enriched.data) ? enriched.data.length : 0,
      data: enriched.data || [],
      headers: enriched.headers || [],
      headerStructure: enriched.headerStructure as unknown as HeaderStructure | undefined,
      createdAt: new Date().toISOString(),
    };

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot save report.",
      });
    }

    const newReport = await ReportModel.create({
      reportId,
      name: reportObj.name,
      type: reportObj.type,
      source: reportObj.source,
      owner: reportObj.owner,
      status: "Pending",
      rowsCount: reportObj.rowsCount,
      data: reportObj.data,
      headers: reportObj.headers,
      headerStructure: reportObj.headerStructure as unknown as Record<string, unknown>,
    });

    await syncReportTypes();

    const createdName = newReport?.name || cleanName;
    const createdRowsCount = newReport?.rowsCount || reportObj.rowsCount;

    await logActivity(req, {
      module: "Reports",
      section: `Report ${createdName}`,
      action: "Add",
      details: `Uploaded new report "${createdName}" with ${createdRowsCount} records.`,
    });

    res.status(201).json({
      success: true,
      data: newReport,
      message: "Report uploaded and stored successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/reports/:id — Edit report
reportsRouter.put("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, type, owner } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Report name is required." });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const cleanName = name.trim();
    const updated = await ReportModel.findOneAndUpdate(
      { $or: [{ _id: id }, { reportId: id }] },
      { name: cleanName, type: cleanName, owner: owner?.trim() || "Unknown" },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Report not found." });
    }

    await syncReportTypes();

    await logActivity(req, {
      module: "Reports",
      section: `Report ${updated.name}`,
      action: "Update",
      details: `Updated report metadata for "${updated.name}".`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Report '${updated.name}' updated successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /api/reports/:id/status — Toggle status
reportsRouter.patch("/:id/status", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ["Pending", "Approved", "Review"];

    if (status && !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(", ")}` });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const updated = await ReportModel.findOneAndUpdate(
      { $or: [{ _id: id }, { reportId: id }] },
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Report not found." });
    }

    await logActivity(req, {
      module: "Reports",
      section: `Report ${updated.name}`,
      action: "Update",
      details: `Toggled report status to "${status}" for "${updated.name}".`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Report status updated to '${status}'.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /api/reports/:id — Delete report
reportsRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const deleted = await ReportModel.findOneAndDelete({
      $or: [{ _id: id }, { reportId: id }],
    });

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Report not found." });
    }

    await syncReportTypes();

    await logActivity(req, {
      module: "Reports",
      section: `Report ${deleted.name}`,
      action: "Delete",
      details: `Deleted report "${deleted.name}".`,
    });

    res.json({
      success: true,
      message: `Report '${deleted.name}' deleted successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/reports/:id/approvals — Approvals update
reportsRouter.post("/:id/approvals", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { selectedIndexes, approvedBy } = req.body;
    const count = Array.isArray(selectedIndexes) ? selectedIndexes.length : 0;

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot save approvals.",
      });
    }

    const report = await ReportModel.findOne({
      $or: [{ _id: id }, { reportId: id }],
    });

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found for approval." });
    }

    const newApprovals = (selectedIndexes || []).map((idx: number) => ({
      rowIndex: idx,
      approvedBy: approvedBy?.trim() || "Unknown",
      approvedAt: new Date(),
    }));

    report.approvals = [...(report.approvals || []), ...newApprovals];
    report.status = "Approved";
    await report.save();

    await logActivity(req, {
      module: "Approvals",
      section: `Report ${report.name}`,
      action: "Update",
      details: `Approved ${count} row(s) in report "${report.name}".`,
    });

    res.json({
      success: true,
      data: report,
      message: `${count} row(s) approved and saved successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

function enrichMeltingReportPurity(
  name: string,
  rawHeaders: string[] = [],
  rawData: Record<string, unknown>[] = [],
  headerStructure?: Record<string, unknown>
): { data: Record<string, unknown>[]; headers: string[]; headerStructure?: Record<string, unknown> } {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { data: rawData, headers: rawHeaders, headerStructure };
  }

  const sampleRow = rawData[0] || {};
  const allKeys = Array.from(new Set([...rawHeaders, ...Object.keys(sampleRow)]));

  const isMelting = name.toLowerCase().includes("melting");

  if (!isMelting) {
    return { data: rawData, headers: rawHeaders, headerStructure };
  }

  const parseNum = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    const str = String(value).trim();
    if (str === "" || str === "—" || str === "-" || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") {
      return 0;
    }
    const cleaned = str.replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const findColumn = (exactNames: string[], fallbackRegex: RegExp): string | undefined => {
    for (const n of exactNames) {
      const found = allKeys.find((c) => c.trim().toLowerCase() === n.toLowerCase());
      if (found) return found;
    }
    return allKeys.find((c) => fallbackRegex.test(c.trim()));
  };

  const inWeightCol = findColumn(["Weight"], /^weight$/i);
  const outPureWeightCol = findColumn(["Pure Wt (2)", "Pure Weight (2)"], /^pure\s*(wt|weight)\s*\(2\)$/i);
  const transNoCol = allKeys.find((c) => /^transno$/i.test(c.trim()));
  const itemCol = allKeys.find((c) => /^(item|description|product|particular)$/i.test(c.trim()));

  // TransNo grouping totals calculation
  const transNoTotals = new Map<string, { totalIn: number; totalOutPure: number }>();
  if (transNoCol && inWeightCol && outPureWeightCol) {
    rawData.forEach((row) => {
      const transNo = String(row[transNoCol] ?? "").trim();
      if (!transNo) return;

      if (!transNoTotals.has(transNo)) {
        transNoTotals.set(transNo, { totalIn: 0, totalOutPure: 0 });
      }
      const totals = transNoTotals.get(transNo)!;

      const inW = parseNum(row[inWeightCol]);
      if (inW > 0) totals.totalIn += inW;

      const itemName = itemCol ? String(row[itemCol] ?? "").trim().toUpperCase() : "";
      if (!itemName.includes("ALLOY")) {
        const outP = parseNum(row[outPureWeightCol]);
        if (outP > 0) totals.totalOutPure += outP;
      }
    });
  }

  const enrichedData = rawData.map((row) => {
    const copy = { ...row };
    const transNo = transNoCol ? String(row[transNoCol] ?? "").trim() : "";
    let purityStr = "—";

    if (transNo && transNoTotals.has(transNo)) {
      const totals = transNoTotals.get(transNo)!;
      if (totals.totalIn > 0) {
        const purity = (totals.totalOutPure / totals.totalIn) * 100;
        purityStr = `${purity.toFixed(2)}%`;
      }
    } else if (inWeightCol && outPureWeightCol) {
      const inW = parseNum(row[inWeightCol]);
      const itemName = itemCol ? String(row[itemCol] ?? "").trim().toUpperCase() : "";
      const outP = itemName.includes("ALLOY") ? 0 : parseNum(row[outPureWeightCol]);
      if (inW > 0) {
        const purity = (outP / inW) * 100;
        purityStr = `${purity.toFixed(2)}%`;
      }
    }

    if (!copy["Purity"] && !copy["purity"]) {
      copy["Purity"] = purityStr;
    }
    return copy;
  });

  const updatedHeaders = rawHeaders.some((h) => /purity/i.test(h))
    ? rawHeaders
    : [...rawHeaders.filter((h) => !/purity/i.test(h)), "Purity"];

  let updatedHeaderStructure = headerStructure;
  if (headerStructure) {
    const subHeaders = Array.isArray(headerStructure.subHeaders) ? (headerStructure.subHeaders as string[]) : [];
    const hasPuritySub = subHeaders.some((s) => /purity/i.test(s));
    const newSub = hasPuritySub ? subHeaders : [...subHeaders.filter((s) => !/purity/i.test(s)), "Purity"];

    updatedHeaderStructure = {
      ...headerStructure,
      subHeaders: newSub,
    };
  }

  return { data: enrichedData, headers: updatedHeaders, headerStructure: updatedHeaderStructure };
}

