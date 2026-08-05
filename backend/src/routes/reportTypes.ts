import { Router } from "express";
import { getDBStatus } from "../db";
import { ReportTypeModel } from "../models/ReportType";

export const reportTypesRouter = Router();

// GET /api/report-types
reportTypesRouter.get("/", async (_req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }
    const items = await ReportTypeModel.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: items,
      message: "Report types catalog retrieved successfully from database.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/report-types — create
reportTypesRouter.post("/", async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Report type name is required." });
    }

    const cleanName = name.trim();
    const dbStatus = getDBStatus();
    const formattedCode = (code || cleanName).toUpperCase().replace(/\s+/g, "_");

    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot create report type.",
      });
    }

    const created = await ReportTypeModel.create({
      name: cleanName,
      code: formattedCode,
      reports: 0,
      lastUpdated: new Date().toISOString().split("T")[0],
      status: "Active",
    });

    res.status(201).json({
      success: true,
      data: created,
      message: `Report type '${cleanName}' created and stored in database.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/report-types/:id — edit
reportTypesRouter.put("/:id", async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Report type name is required." });
    }

    const cleanName = name.trim();
    const formattedCode = (code || cleanName).toUpperCase().replace(/\s+/g, "_");

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const updated = await ReportTypeModel.findByIdAndUpdate(
      req.params.id,
      { name: cleanName, code: formattedCode, lastUpdated: new Date().toISOString().split("T")[0] },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Report type not found." });
    }

    res.json({
      success: true,
      data: updated,
      message: `Report type '${updated.name}' updated successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /api/report-types/:id/status — toggle status
reportTypesRouter.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body as { status?: string };
    const allowed = ["Active", "Inactive"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(", ")}` });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const updated = await ReportTypeModel.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Report type not found." });
    }

    res.json({
      success: true,
      data: updated,
      message: `Report type status updated to "${status}".`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /api/report-types/:id — delete
reportTypesRouter.delete("/:id", async (req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const deleted = await ReportTypeModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Report type not found." });
    }

    res.json({
      success: true,
      message: `Report type '${deleted.name}' deleted successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
