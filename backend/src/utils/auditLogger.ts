import { Request } from "express";
import { AuthRequest } from "../middleware/auth";
import { AuditLogModel, inMemoryAuditLogs } from "../models/AuditLog";
import { getDBStatus } from "../db";
import { AuditSessionLog, AuditTimelineAction } from "@shared/api";

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

function extractClientIP(req: Request): string {
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

function extractUserAgent(req: Request): string {
  const ua = req.headers["user-agent"];
  if (typeof ua === "string" && ua.trim()) {
    return ua.trim();
  }
  return "Browser Client";
}

/**
 * Creates a new Session Log when a user logs in.
 */
export async function startUserSession(
  req: Request,
  user: { name: string; email: string; role: string }
): Promise<string> {
  const sessionId = `sess_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const ipAddress = extractClientIP(req);
  const userAgent = extractUserAgent(req);
  const now = new Date();
  const isoNow = now.toISOString();

  const initialAction: AuditTimelineAction = {
    id: `act_${Date.now()}_0`,
    timestamp: isoNow,
    module: "Auth",
    section: "Login Screen",
    action: "Login",
    details: `${user.name} signed in successfully.`,
  };

  const newSession: AuditSessionLog = {
    id: sessionId,
    _id: sessionId,
    sessionId,
    userName: user.name,
    userEmail: user.email.toLowerCase(),
    userRole: user.role,
    loginTime: isoNow,
    logoutTime: null,
    status: "Active",
    duration: "Active session",
    ipAddress,
    userAgent,
    totalActions: 1,
    timeline: [initialAction],
  };

  // Keep active in-memory
  inMemoryAuditLogs.unshift(newSession);
  if (inMemoryAuditLogs.length > 300) inMemoryAuditLogs.pop();

  const dbStatus = getDBStatus();
  if (dbStatus.stateCode === 1) {
    try {
      const doc = new AuditLogModel({
        sessionId,
        userName: user.name,
        userEmail: user.email.toLowerCase(),
        userRole: user.role,
        loginTime: now,
        logoutTime: null,
        status: "Active",
        ipAddress,
        userAgent,
        totalActions: 1,
        timeline: [
          {
            timestamp: now,
            module: "Auth",
            section: "Login Screen",
            action: "Login",
            details: `${user.name} signed in successfully.`,
          },
        ],
      });
      await doc.save();
    } catch (err) {
      console.warn("⚠️ Failed to save new AuditLog session in MongoDB:", err);
    }
  }

  return sessionId;
}

/**
 * Marks the active user session as completed on logout.
 */
export async function endUserSession(
  req: AuthRequest | Request,
  user: { name: string; email: string }
): Promise<void> {
  const email = user.email.toLowerCase();
  const now = new Date();
  const isoNow = now.toISOString();

  // Update in-memory session
  const memSession = inMemoryAuditLogs.find((s) => s.userEmail === email && s.status === "Active");
  if (memSession) {
    memSession.logoutTime = isoNow;
    memSession.status = "Completed";
    memSession.timeline.push({
      id: `act_${Date.now()}`,
      timestamp: isoNow,
      module: "Auth",
      section: "User Session",
      action: "Logout",
      details: `${user.name} logged out.`,
    });
    memSession.totalActions = memSession.timeline.length;
  }

  const dbStatus = getDBStatus();
  if (dbStatus.stateCode === 1) {
    try {
      const dbSession = await AuditLogModel.findOne({ userEmail: email, status: "Active" }).sort({ loginTime: -1 });
      if (dbSession) {
        dbSession.logoutTime = now;
        dbSession.status = "Completed";
        dbSession.timeline.push({
          timestamp: now,
          module: "Auth",
          section: "User Session",
          action: "Logout",
          details: `${user.name} logged out.`,
        });
        dbSession.totalActions = dbSession.timeline.length;
        await dbSession.save();
      }
    } catch (err) {
      console.warn("⚠️ Failed to end AuditLog session in MongoDB:", err);
    }
  }
}

/**
 * Logs an action within the user's current active session timeline.
 */
export async function logActivity(
  req: AuthRequest | Request,
  params: LogActivityParams
): Promise<AuditSessionLog | null> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;

    const userName = params.userName || user?.name || "System User";
    const userEmail = (params.userEmail || user?.email || "system@sgreport.com").toLowerCase();
    const userRole = params.userRole || user?.role || "Viewer";
    const ipAddress = params.ipAddress || extractClientIP(req);
    const userAgent = extractUserAgent(req);
    const now = new Date();
    const isoNow = now.toISOString();

    const actionItem: AuditTimelineAction = {
      id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: isoNow,
      module: params.module,
      section: params.section,
      action: params.action,
      details: params.details || "",
    };

    // 1. Check in-memory store for active session
    let memSession = inMemoryAuditLogs.find((s) => s.userEmail === userEmail && s.status === "Active");
    if (!memSession) {
      memSession = {
        id: `sess_${Date.now()}`,
        _id: `sess_${Date.now()}`,
        sessionId: `sess_${Date.now()}`,
        userName,
        userEmail,
        userRole,
        loginTime: isoNow,
        logoutTime: null,
        status: "Active",
        duration: "Active session",
        ipAddress,
        userAgent,
        totalActions: 0,
        timeline: [],
      };
      inMemoryAuditLogs.unshift(memSession);
    }
    memSession.timeline.push(actionItem);
    memSession.totalActions = memSession.timeline.length;

    // 2. Check MongoDB for active session
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode === 1) {
      let dbSession = await AuditLogModel.findOne({ userEmail, status: "Active" }).sort({ loginTime: -1 });

      if (!dbSession) {
        dbSession = new AuditLogModel({
          sessionId: `sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          userName,
          userEmail,
          userRole,
          loginTime: now,
          status: "Active",
          ipAddress,
          userAgent,
          totalActions: 0,
          timeline: [],
        });
      }

      dbSession.timeline.push({
        timestamp: now,
        module: params.module,
        section: params.section,
        action: params.action,
        details: params.details || "",
      });
      dbSession.totalActions = dbSession.timeline.length;
      await dbSession.save();
    }

    return memSession;
  } catch (err) {
    console.warn("⚠️ Failed to record audit log activity:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
