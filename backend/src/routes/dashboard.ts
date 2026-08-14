import { Router } from "express";
import { getDBStatus } from "../db";
import { ReportModel } from "../models/Report";
import { DashboardSummary } from "@shared/api";
import { AuthRequest, authenticateToken } from "../middleware/auth";
import { buildRoleScopeFilter } from "./reports";

export const dashboardRouter = Router();

function buildCreatedAtFilter(startDate?: unknown, endDate?: unknown) {
  const createdAtFilter: Record<string, Date> = {};

  if (startDate && typeof startDate === "string" && startDate.trim()) {
    const s = startDate.trim();
    const startUtc = new Date(s.includes("T") ? s : `${s}T00:00:00.000Z`).getTime();
    const startLocal = new Date(s.includes("T") ? s : `${s}T00:00:00.000`).getTime();
    const minStart = isNaN(startLocal) ? startUtc : Math.min(startUtc, startLocal);
    createdAtFilter.$gte = new Date(minStart);
  }

  if (endDate && typeof endDate === "string" && endDate.trim()) {
    const e = endDate.trim();
    const endUtc = new Date(e.includes("T") ? e : `${e}T23:59:59.999Z`).getTime();
    const endLocal = new Date(e.includes("T") ? e : `${e}T23:59:59.999`).getTime();
    const maxEnd = isNaN(endLocal) ? endUtc : Math.max(endUtc, endLocal);
    createdAtFilter.$lte = new Date(maxEnd);
  }

  return Object.keys(createdAtFilter).length > 0 ? createdAtFilter : null;
}

dashboardRouter.get("/summary", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fromDate = (req.query.fromDate || req.query.startDate) as string | undefined;
    const toDate = (req.query.toDate || req.query.endDate) as string | undefined;
    const period = (req.query.period as string) || "Custom";
    const dbStatus = getDBStatus();

    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const queryFilter: Record<string, unknown> = {};

    if (fromDate || toDate) {
      const createdAtFilter = buildCreatedAtFilter(fromDate, toDate);
      if (createdAtFilter) {
        queryFilter.createdAt = createdAtFilter;
      }
    }

    const roleScope = await buildRoleScopeFilter(req);
    const finalQuery = Object.keys(roleScope).length > 0
      ? { $and: [queryFilter, roleScope] }
      : queryFilter;

    const reports = await ReportModel.find(finalQuery).sort({
      createdAt: -1,
      updatedAt: -1,
      _id: -1,
    });
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
      message: "Dashboard summary retrieved successfully from database.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

