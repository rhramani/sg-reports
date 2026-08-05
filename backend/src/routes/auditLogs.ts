import { Router, Response } from "express";
import { AuthRequest, authorizeRoles } from "../middleware/auth";
import { AuditLogModel, inMemoryAuditLogs } from "../models/AuditLog";
import { logActivity } from "../utils/auditLogger";
import { getDBStatus } from "../db";
import { AuditLogItem, AuditLogMetrics, AuditLogResponse } from "@shared/api";

export const auditLogsRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/audit-logs
// Super Admin only. Fetches searchable, filterable, paginated audit logs.
// ─────────────────────────────────────────────────────────────────────────────
auditLogsRouter.get(
  "/",
  authorizeRoles("Super Admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const search = (req.query.search as string || "").trim().toLowerCase();
      const moduleFilter = (req.query.module as string || "").trim();
      const actionFilter = (req.query.action as string || "").trim();
      const roleFilter = (req.query.role as string || "").trim();
      const startDate = req.query.startDate as string || "";
      const endDate = req.query.endDate as string || "";
      const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "15", 10)));

      const dbStatus = getDBStatus();
      let logs: AuditLogItem[] = [];
      let totalCount = 0;

      if (dbStatus.stateCode === 1) {
        // Query MongoDB
        const query: Record<string, unknown> = {};

        if (moduleFilter && moduleFilter !== "All") {
          query.module = moduleFilter;
        }

        if (actionFilter && actionFilter !== "All") {
          query.action = actionFilter;
        }

        if (roleFilter && roleFilter !== "All") {
          query.userRole = roleFilter;
        }

        if (startDate || endDate) {
          query.timestamp = {};
          if (startDate) {
            (query.timestamp as Record<string, unknown>).$gte = new Date(startDate);
          }
          if (endDate) {
            // Include end of day
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            (query.timestamp as Record<string, unknown>).$lte = end;
          }
        }

        if (search) {
          const searchRegex = new RegExp(search, "i");
          query.$or = [
            { userName: searchRegex },
            { userEmail: searchRegex },
            { module: searchRegex },
            { section: searchRegex },
            { action: searchRegex },
            { ipAddress: searchRegex },
            { details: searchRegex },
          ];
        }

        totalCount = await AuditLogModel.countDocuments(query);
        const docs = await AuditLogModel.find(query)
          .sort({ timestamp: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();

        logs = docs.map((doc) => ({
          id: String(doc._id),
          _id: String(doc._id),
          userName: doc.userName,
          userEmail: doc.userEmail,
          userRole: doc.userRole,
          module: doc.module,
          section: doc.section,
          action: doc.action,
          timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : String(doc.timestamp),
          ipAddress: doc.ipAddress || "127.0.0.1",
          details: doc.details || "",
        }));
      } else {
        // Fallback filtering in memory
        let filtered = [...inMemoryAuditLogs];

        if (moduleFilter && moduleFilter !== "All") {
          filtered = filtered.filter((l) => l.module === moduleFilter);
        }

        if (actionFilter && actionFilter !== "All") {
          filtered = filtered.filter((l) => l.action === actionFilter);
        }

        if (roleFilter && roleFilter !== "All") {
          filtered = filtered.filter((l) => l.userRole === roleFilter);
        }

        if (startDate) {
          const startMs = new Date(startDate).getTime();
          filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= startMs);
        }

        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          const endMs = end.getTime();
          filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= endMs);
        }

        if (search) {
          filtered = filtered.filter((l) => {
            const text = `${l.userName} ${l.userEmail} ${l.module} ${l.section} ${l.action} ${l.ipAddress || ""} ${l.details || ""}`.toLowerCase();
            return text.includes(search);
          });
        }

        totalCount = filtered.length;
        logs = filtered.slice((page - 1) * limit, page * limit);
      }

      // Compute Summary Metrics
      const allLogsSource = dbStatus.stateCode === 1 ? await AuditLogModel.find({}).lean() : inMemoryAuditLogs;
      
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const activeUsersSet = new Set<string>();
      const moduleCounts: Record<string, number> = {};
      let securityEventsCount = 0;

      allLogsSource.forEach((log) => {
        const logDate = new Date(log.timestamp);
        if (logDate >= todayStart) {
          activeUsersSet.add(log.userEmail);
        }
        moduleCounts[log.module] = (moduleCounts[log.module] || 0) + 1;
        if (log.action === "Login" || log.action === "Logout") {
          securityEventsCount++;
        }
      });

      let topModule = "None";
      let maxCount = 0;
      Object.entries(moduleCounts).forEach(([mod, count]) => {
        if (count > maxCount) {
          maxCount = count;
          topModule = mod;
        }
      });

      const metrics: AuditLogMetrics = {
        totalLogs: dbStatus.stateCode === 1 ? await AuditLogModel.countDocuments({}) : inMemoryAuditLogs.length,
        activeUsersToday: activeUsersSet.size,
        topModule,
        securityEvents: securityEventsCount,
      };

      const pages = Math.ceil(totalCount / limit) || 1;

      const response: AuditLogResponse = {
        success: true,
        data: logs,
        total: totalCount,
        page,
        pages,
        metrics,
      };

      return res.json(response);
    } catch (err) {
      console.error("Error in GET /api/audit-logs:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to retrieve activity log records.",
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/audit-logs
// Records custom client-side actions (e.g. Page Views, Navigation, Exports).
// ─────────────────────────────────────────────────────────────────────────────
auditLogsRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { module, section, action, details } = req.body || {};

    if (!module || !action) {
      return res.status(400).json({
        success: false,
        error: "Module and Action are required for logging activity.",
      });
    }

    const logEntry = await logActivity(req, {
      module: String(module),
      section: String(section || module),
      action: String(action),
      details: details ? String(details) : undefined,
    });

    return res.status(201).json({
      success: true,
      message: "Activity logged successfully.",
      data: logEntry,
    });
  } catch (err) {
    console.error("Error in POST /api/audit-logs:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to log activity.",
    });
  }
});
