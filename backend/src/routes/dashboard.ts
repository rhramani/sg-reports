import { Router } from "express";
import { getDBStatus } from "../db";
import { ReportModel } from "../models/Report";
import { DashboardSummary } from "@shared/api";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (req, res) => {
  try {
    const period = (req.query.period as string) || "Month";
    const dbStatus = getDBStatus();

    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const reports = await ReportModel.find().sort({ createdAt: -1 });
    const reportsInPeriod = reports.length;
    const approvedReports = reports.filter((r) => r.status === "Approved").length;
    const pendingReview = reports.filter((r) => r.status === "Pending" || r.status === "Review").length;
    const recordsProcessed = reports.reduce((acc, r) => acc + (r.rowsCount || 0), 0);

    const summary: DashboardSummary = {
      period,
      metrics: {
        reportsInPeriod,
        approvedReports,
        pendingReview,
        recordsProcessed,
      },
      reports: reports as unknown as DashboardSummary["reports"],
    };

    res.json({
      success: true,
      data: summary,
      message: `Dashboard summary for ${period} retrieved successfully from database.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
