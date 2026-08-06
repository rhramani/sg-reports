import mongoose, { Schema, model, Document, Model } from "mongoose";
import { AuditSessionLog } from "@shared/api";

interface IAuditTimelineAction {
  _id?: unknown;
  timestamp: Date;
  module: string;
  section: string;
  action: string;
  details?: string;
}

export interface IAuditLog extends Document {
  sessionId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  loginTime: Date;
  logoutTime?: Date | null;
  status: "Active" | "Completed";
  ipAddress: string;
  userAgent?: string;
  totalActions: number;
  timeline: IAuditTimelineAction[];
}

const TimelineActionSchema = new Schema<IAuditTimelineAction>(
  {
    timestamp: { type: Date, default: Date.now },
    module: { type: String, required: true },
    section: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: "" },
  },
  { _id: true }
);

const AuditLogSchema = new Schema<IAuditLog>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true, index: true },
    userRole: { type: String, required: true, index: true },
    loginTime: { type: Date, default: Date.now, index: true },
    logoutTime: { type: Date, default: null },
    status: { type: String, enum: ["Active", "Completed"], default: "Active", index: true },
    ipAddress: { type: String, default: "127.0.0.1" },
    userAgent: { type: String, default: "Browser Client" },
    totalActions: { type: Number, default: 1 },
    timeline: [TimelineActionSchema],
  },
  { timestamps: true }
);

AuditLogSchema.index({ loginTime: -1 });

export const AuditLogModel: Model<IAuditLog> =
  (mongoose.connection.models["AuditLog"] as Model<IAuditLog>) ??
  model<IAuditLog>("AuditLog", AuditLogSchema);

// In-memory fallback dataset for degraded DB operation
export const inMemoryAuditLogs: AuditSessionLog[] = [
  {
    id: "sess_101",
    _id: "sess_101",
    sessionId: "sess_superadmin_01",
    userName: "Super Administrator",
    userEmail: "superadmin@nexora.com",
    userRole: "Super Admin",
    loginTime: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    logoutTime: null,
    status: "Active",
    duration: "Active session",
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/122.0.0.0",
    totalActions: 3,
    timeline: [
      {
        id: "act_1",
        timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        module: "Auth",
        section: "Login Screen",
        action: "Login",
        details: "Super Admin signed in successfully.",
      },
      {
        id: "act_2",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        module: "Permissions",
        section: "Report Analyst Matrix",
        action: "Update",
        details: "Updated permission rules for Report Analyst role.",
      },
      {
        id: "act_3",
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        module: "Activity Log",
        section: "Activity Log Screen",
        action: "View",
        details: "Viewed Workspace Activity Log timeline.",
      },
    ],
  },
  {
    id: "sess_102",
    _id: "sess_102",
    sessionId: "sess_sarah_02",
    userName: "Sarah Jenkins",
    userEmail: "sarah@company.com",
    userRole: "Report Analyst",
    loginTime: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    logoutTime: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    status: "Completed",
    duration: "40m 00s",
    ipAddress: "192.168.1.42",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/123.0",
    totalActions: 4,
    timeline: [
      {
        id: "act_10",
        timestamp: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
        module: "Auth",
        section: "Login Screen",
        action: "Login",
        details: "User Sarah Jenkins signed in successfully.",
      },
      {
        id: "act_11",
        timestamp: new Date(Date.now() - 170 * 60 * 1000).toISOString(),
        module: "Reports",
        section: "Q4 Financial Audit",
        action: "View",
        details: "Opened Q4 Financial Audit report viewer.",
      },
      {
        id: "act_12",
        timestamp: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
        module: "Reports",
        section: "Q4 Financial Audit",
        action: "Export",
        details: "Exported 1,420 rows to CSV format.",
      },
      {
        id: "act_13",
        timestamp: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
        module: "Auth",
        section: "User Session",
        action: "Logout",
        details: "User logged out.",
      },
    ],
  },
];
