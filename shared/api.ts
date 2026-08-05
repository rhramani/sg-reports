/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

export interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PingResponse {
  message: string;
}

export interface PermissionActions {
  view: boolean;
  add: boolean;
  update: boolean;
  delete: boolean;
  export: boolean;
}

export interface ModulePermission {
  module: string;
  actions: PermissionActions;
}

export interface UserSession {
  email: string;
  name: string;
  role: string;
  authenticatedAt: string;
  expiresAt?: number;
  modulePermissions?: ModulePermission[];
}

export interface LoginRequest {
  email: string;
  password?: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  expiresAt?: number;
  user?: UserSession;
  message?: string;
  error?: string;
  /** Which input field caused the error: "email" | "password" */
  field?: "email" | "password";
}

export interface ReportItem {
  id?: string;
  _id?: string;
  reportId?: string;
  name: string;
  type: string;
  source: string;
  owner: string;
  status: "Pending" | "Approved" | "Review" | "Inactive";
  rowsCount: number;
  data?: Record<string, unknown>[];
  createdAt?: string | Date;
}

export interface UserItem {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: string;
  lastActive: string;
  status: "Active" | "Pending" | "Inactive";
}

export interface RoleItem {
  id?: string;
  _id?: string;
  role: string;
  members: number;
  permissions: string;
  created: string;
  status: "Active" | "Inactive";
}

export interface ReportTypeItem {
  id?: string;
  _id?: string;
  name: string;
  code: string;
  reports: number;
  lastUpdated: string;
  status: "Active" | "Inactive";
}

export interface ApprovalItem {
  id?: string;
  _id?: string;
  report: string;
  submittedBy: string;
  submitted: string;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "Approved" | "Review";
}

export interface DashboardSummary {
  period: string;
  metrics: {
    reportsInPeriod: number;
    approvedReports: number;
    pendingReview: number;
    recordsProcessed: number;
  };
  reports: ReportItem[];
}

export type AuditActionType =
  | "View"
  | "Add"
  | "Update"
  | "Delete"
  | "Export"
  | "Login"
  | "Logout"
  | string;

export interface AuditLogItem {
  id?: string;
  _id?: string;
  userName: string;
  userEmail: string;
  userRole: string;
  module: string;
  section: string;
  action: AuditActionType;
  timestamp: string;
  ipAddress?: string;
  details?: string;
}

export interface AuditLogMetrics {
  totalLogs: number;
  activeUsersToday: number;
  topModule: string;
  securityEvents: number;
}

export interface AuditLogResponse {
  success: boolean;
  data: AuditLogItem[];
  total: number;
  page: number;
  pages: number;
  metrics: AuditLogMetrics;
  error?: string;
}

