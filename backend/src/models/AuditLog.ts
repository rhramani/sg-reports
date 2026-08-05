import mongoose, { Schema, model, Document, Model } from "mongoose";
import { AuditLogItem } from "@shared/api";

export interface IAuditLog extends Document {
  userName: string;
  userEmail: string;
  userRole: string;
  module: string;
  section: string;
  action: string;
  timestamp: Date;
  ipAddress?: string;
  details?: string;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userName: { type: String, required: true },
    userEmail: { type: String, required: true, index: true },
    userRole: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    section: { type: String, required: true },
    action: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    ipAddress: { type: String, default: "127.0.0.1" },
    details: { type: String, default: "" },
  },
  { timestamps: true }
);

AuditLogSchema.index({ timestamp: -1 });

export const AuditLogModel: Model<IAuditLog> =
  (mongoose.connection.models["AuditLog"] as Model<IAuditLog>) ??
  model<IAuditLog>("AuditLog", AuditLogSchema);

// In-memory fallback dataset for degraded DB operation
export const inMemoryAuditLogs: AuditLogItem[] = [
  {
    id: "log_101",
    userName: "Super Administrator",
    userEmail: "superadmin@nexora.com",
    userRole: "Super Admin",
    module: "Auth",
    section: "Login Screen",
    action: "Login",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    ipAddress: "127.0.0.1",
    details: "Super Admin logged in successfully.",
  },
  {
    id: "log_102",
    userName: "Sarah Jenkins",
    userEmail: "sarah@company.com",
    userRole: "Report Analyst",
    module: "Reports",
    section: "Q4 Financial Audit",
    action: "Export",
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    ipAddress: "192.168.1.42",
    details: "Exported 1,420 rows to CSV format.",
  },
  {
    id: "log_103",
    userName: "Marcus Vance",
    userEmail: "marcus@company.com",
    userRole: "Audit Supervisor",
    module: "Approvals",
    section: "Q2 Sales Report Queue",
    action: "Update",
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    ipAddress: "192.168.1.88",
    details: "Approved report row item #104.",
  },
  {
    id: "log_104",
    userName: "Super Administrator",
    userEmail: "superadmin@nexora.com",
    userRole: "Super Admin",
    module: "Permissions",
    section: "Report Analyst Matrix",
    action: "Update",
    timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    ipAddress: "127.0.0.1",
    details: "Updated permission rules for Report Analyst role.",
  },
  {
    id: "log_105",
    userName: "Elena Rostova",
    userEmail: "elena@company.com",
    userRole: "Viewer",
    module: "Users",
    section: "User Directory",
    action: "View",
    timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    ipAddress: "10.0.0.15",
    details: "Viewed user list directory.",
  },
];
