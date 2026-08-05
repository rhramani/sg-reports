import { Router } from "express";
import { getDBStatus } from "../db";
import { ReportModel } from "../models/Report";
import { ReportItem } from "@shared/api";
import { AuthRequest } from "../middleware/auth";
import { logActivity } from "../utils/auditLogger";

export const reportsRouter = Router();

// GET /api/reports — List all reports
reportsRouter.get("/", async (_req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }
    const reports = await ReportModel.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: reports,
      message: "Reports retrieved successfully.",
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
    const { name, type, source, owner, data } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Report name is required.",
      });
    }

    const reportId = `REP-${Date.now().toString(36).toUpperCase()}`;
    const reportObj: ReportItem = {
      reportId,
      name: name.trim(),
      type: type || "Dynamic Report",
      source: source || "Spreadsheet Upload",
      owner: owner?.trim() || "Unknown",
      status: "Pending",
      rowsCount: Array.isArray(data) ? data.length : 0,
      data: data || [],
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
    });

    await logActivity(req, {
      module: "Reports",
      section: `Report ${newReport.name}`,
      action: "Add",
      details: `Uploaded new report "${newReport.name}" with ${newReport.rowsCount} records.`,
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

    const updated = await ReportModel.findOneAndUpdate(
      { $or: [{ _id: id }, { reportId: id }] },
      { name: name.trim(), type: type?.trim() || "Dynamic Report", owner: owner?.trim() || "Unknown" },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Report not found." });
    }

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

