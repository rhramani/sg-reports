import { Request } from "express";
import { AuthRequest } from "../middleware/auth";
import { AuditLogModel, inMemoryAuditLogs } from "../models/AuditLog";
import { getDBStatus } from "../db";
import { AuditLogItem } from "@shared/api";

export interface LogActivityParams {
  userName?: string;
  userEmail?: string;
  userRole?: string;
  module: string;
  section: string;
  action: "View" | "Add" | "Update" | "Delete" | "Export" | "Login" | "Logout" | string;
  details?: string;
  ipAddress?: string;
}

export function extractClientIP(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    if (ips) return ips.trim();
  }
  if (req.ip && req.ip !== "::1" && req.ip !== "127.0.0.1") {
    return req.ip;
  }
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  return "127.0.0.1";
}

export async function logActivity(
  req: AuthRequest | Request,
  params: LogActivityParams
): Promise<AuditLogItem | null> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;

    const userName = params.userName || user?.name || "System User";
    const userEmail = params.userEmail || user?.email || "system@nexora.com";
    const userRole = params.userRole || user?.role || "Viewer";
    const ipAddress = params.ipAddress || extractClientIP(req);
    const timestamp = new Date().toISOString();

    const logEntry: AuditLogItem = {
      id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userName,
      userEmail,
      userRole,
      module: params.module,
      section: params.section,
      action: params.action,
      timestamp,
      ipAddress,
      details: params.details || "",
    };

    // Always push to in-memory store for instant visibility & degraded mode
    inMemoryAuditLogs.unshift(logEntry);
    if (inMemoryAuditLogs.length > 500) {
      inMemoryAuditLogs.pop(); // limit memory growth
    }

    // Save to MongoDB if connected
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode === 1) {
      const doc = new AuditLogModel({
        userName,
        userEmail,
        userRole,
        module: params.module,
        section: params.section,
        action: params.action,
        timestamp: new Date(timestamp),
        ipAddress,
        details: params.details || "",
      });
      await doc.save();
    }

    return logEntry;
  } catch (err) {
    console.warn("⚠️ Failed to record audit log:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
