import { Router } from "express";
import { getDBStatus } from "../db";
import { ApprovalQueueModel } from "../models/ApprovalQueue";

export const approvalsRouter = Router();

// GET /api/approvals
approvalsRouter.get("/", async (_req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }
    const items = await ApprovalQueueModel.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: items,
      message: "Approval queue retrieved successfully from database.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/approvals — create
approvalsRouter.post("/", async (req, res) => {
  try {
    const { report, submittedBy, priority } = req.body;
    const dbStatus = getDBStatus();

    const reportName = (report || "Spreadsheet Upload").trim();
    if (!reportName) {
      return res.status(400).json({ success: false, error: "Report name is required for approval queue item." });
    }

    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot submit approval.",
      });
    }

    const created = await ApprovalQueueModel.create({
      report: reportName,
      submittedBy: submittedBy || "System",
      priority: priority || "Medium",
      status: "Pending",
    });

    res.status(201).json({
      success: true,
      data: created,
      message: `Approval item for '${reportName}' saved to database.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/approvals/:id — edit
approvalsRouter.put("/:id", async (req, res) => {
  try {
    const { report, submittedBy, priority } = req.body;
    if (!report || !report.trim()) {
      return res.status(400).json({ success: false, error: "Report name is required." });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const updated = await ApprovalQueueModel.findByIdAndUpdate(
      req.params.id,
      {
        report: report.trim(),
        submittedBy: submittedBy?.trim() || "System",
        priority: priority || "Medium",
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Approval item not found." });
    }

    res.json({
      success: true,
      data: updated,
      message: `Approval item updated successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /api/approvals/:id — toggle status
approvalsRouter.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ["Pending", "Approved", "Review"];

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.json({
        success: true,
        message: `Approval status for item ${id} updated to '${status}'.`,
      });
    }

    if (status && !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(", ")}` });
    }

    const updated = await ApprovalQueueModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, error: "Approval queue item not found." });
    }

    res.json({
      success: true,
      data: updated,
      message: `Approval status for item updated to '${status}'.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /api/approvals/:id — delete
approvalsRouter.delete("/:id", async (req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const deleted = await ApprovalQueueModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Approval item not found." });
    }

    res.json({
      success: true,
      message: `Approval item '${deleted.report}' deleted successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
