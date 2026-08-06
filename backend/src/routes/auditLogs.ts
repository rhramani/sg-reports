import { Router, Response } from "express";
import { AuthRequest, authorizeRoles } from "../middleware/auth";
import { AuditLogModel, inMemoryAuditLogs } from "../models/AuditLog";
import { logActivity } from "../utils/auditLogger";
import { getDBStatus } from "../db";
import { AuditSessionLog, AuditLogMetrics, AuditLogResponse } from "@shared/api";

export const auditLogsRouter = Router();

function calculateDuration(loginIso: string | Date, logoutIso?: string | Date | null): string {
  const start = new Date(loginIso).getTime();
  if (isNaN(start)) return "Active session";
  if (!logoutIso) return "Active session";
  const end = new Date(logoutIso).getTime();
  if (isNaN(end) || end < start) return "Active session";
  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/audit-logs
// Super Admin only. Fetches searchable, filterable, paginated audit session logs.
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
      let sessionLogs: AuditSessionLog[] = [];
      let totalCount = 0;

      if (dbStatus.stateCode === 1) {
        // Query MongoDB
        const query: Record<string, unknown> = {};

        if (roleFilter && roleFilter !== "All") {
          query.userRole = roleFilter;
        }

        if (moduleFilter && moduleFilter !== "All") {
          query["timeline.module"] = moduleFilter;
        }

        if (actionFilter && actionFilter !== "All") {
          query["timeline.action"] = actionFilter;
        }

        if (startDate || endDate) {
          query.loginTime = {};
          if (startDate) {
            (query.loginTime as Record<string, unknown>).$gte = new Date(startDate);
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            (query.loginTime as Record<string, unknown>).$lte = end;
          }
        }

        if (search) {
          const searchRegex = new RegExp(search, "i");
          query.$or = [
            { userName: searchRegex },
            { userEmail: searchRegex },
            { userRole: searchRegex },
            { ipAddress: searchRegex },
            { userAgent: searchRegex },
            { "timeline.module": searchRegex },
            { "timeline.section": searchRegex },
            { "timeline.action": searchRegex },
            { "timeline.details": searchRegex },
          ];
        }

        totalCount = await AuditLogModel.countDocuments(query);
        const docs = await AuditLogModel.find(query)
          .sort({ loginTime: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();

        sessionLogs = docs.map((doc) => {
          const loginIso = doc.loginTime instanceof Date ? doc.loginTime.toISOString() : String(doc.loginTime);
          const logoutIso = doc.logoutTime ? (doc.logoutTime instanceof Date ? doc.logoutTime.toISOString() : String(doc.logoutTime)) : null;

          return {
            id: String(doc._id),
            _id: String(doc._id),
            sessionId: doc.sessionId,
            userName: doc.userName,
            userEmail: doc.userEmail,
            userRole: doc.userRole,
            loginTime: loginIso,
            logoutTime: logoutIso,
            status: doc.status || (logoutIso ? "Completed" : "Active"),
            duration: calculateDuration(loginIso, logoutIso),
            ipAddress: doc.ipAddress || "127.0.0.1",
            userAgent: doc.userAgent || "Browser Client",
            totalActions: doc.timeline ? doc.timeline.length : (doc.totalActions || 1),
            timeline: (doc.timeline || []).map((t, idx) => ({
              id: String(t._id || `t_${idx}`),
              timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp),
              module: t.module,
              section: t.section,
              action: t.action,
              details: t.details || "",
            })),
          };
        });
      } else {
        // Fallback filtering in memory
        let filtered = [...inMemoryAuditLogs];

        if (roleFilter && roleFilter !== "All") {
          filtered = filtered.filter((l) => l.userRole === roleFilter);
        }

        if (moduleFilter && moduleFilter !== "All") {
          filtered = filtered.filter((l) => l.timeline.some((t) => t.module === moduleFilter));
        }

        if (actionFilter && actionFilter !== "All") {
          filtered = filtered.filter((l) => l.timeline.some((t) => t.action === actionFilter));
        }

        if (startDate) {
          const startMs = new Date(startDate).getTime();
          filtered = filtered.filter((l) => new Date(l.loginTime).getTime() >= startMs);
        }

        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          const endMs = end.getTime();
          filtered = filtered.filter((l) => new Date(l.loginTime).getTime() <= endMs);
        }

        if (search) {
          filtered = filtered.filter((l) => {
            const timelineText = l.timeline.map((t) => `${t.module} ${t.section} ${t.action} ${t.details || ""}`).join(" ");
            const text = `${l.userName} ${l.userEmail} ${l.userRole} ${l.ipAddress || ""} ${l.userAgent || ""} ${timelineText}`.toLowerCase();
            return text.includes(search);
          });
        }

        totalCount = filtered.length;
        sessionLogs = filtered.slice((page - 1) * limit, page * limit).map((l) => ({
          ...l,
          duration: calculateDuration(l.loginTime, l.logoutTime),
        }));
      }

      // Compute Summary Metrics
      const allLogsSource = dbStatus.stateCode === 1 ? await AuditLogModel.find({}).lean() : inMemoryAuditLogs;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const activeUsersSet = new Set<string>();
      const moduleCounts: Record<string, number> = {};
      let securityEventsCount = 0;

      allLogsSource.forEach((sess) => {
        const loginDate = new Date(sess.loginTime);
        if (loginDate >= todayStart) {
          activeUsersSet.add(sess.userEmail);
        }

        const actionsList = (sess.timeline || []) as { module: string; action: string }[];
        actionsList.forEach((act) => {
          moduleCounts[act.module] = (moduleCounts[act.module] || 0) + 1;
          if (act.action === "Login" || act.action === "Logout") {
            securityEventsCount++;
          }
        });
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
        totalLogs: totalCount,
        activeUsersToday: activeUsersSet.size,
        topModule,
        securityEvents: securityEventsCount,
      };

      const pages = Math.ceil(totalCount / limit) || 1;

      const response: AuditLogResponse = {
        success: true,
        data: sessionLogs,
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
        error: "Failed to retrieve activity session logs.",
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
