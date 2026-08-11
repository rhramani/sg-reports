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
export const inMemoryAuditLogs: AuditSessionLog[] = [];

