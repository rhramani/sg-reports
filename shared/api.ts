/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

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

export interface UserNotificationPreferences {
  emailAlerts: boolean;
  approvalReminders: boolean;
  weeklyDigest: boolean;
}

export interface UserSession {
  email: string;
  name: string;
  role: string;
  authenticatedAt: string;
  expiresAt?: number;
  mobileNumber?: string;
  department?: string;
  avatar?: string;
  bio?: string;
  notifications?: UserNotificationPreferences;
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

export interface MergedCellSpan {
  s: { r: number; c: number };
  e: { r: number; c: number };
  rowSpan: number;
  colSpan: number;
  value?: string;
}

export interface SubHeaderCol {
  key: string;
  label: string;
}

export interface MainHeaderGroup {
  title: string;
  colSpan: number;
  rowSpan?: number;
  isMerged?: boolean;
  startCol?: number;
  endCol?: number;
  columns: SubHeaderCol[];
}

export interface HeaderLevel {
  levelIndex: number;
  groups: MainHeaderGroup[];
}

export interface HeaderStructure {
  isMultiLevel: boolean;
  levels?: HeaderLevel[];
  mainHeaders: MainHeaderGroup[];
  subHeaders: string[];
  dimensions?: {
    rowCount: number;
    colCount: number;
    headerRowCount?: number;
    dataRowCount?: number;
  };
  mergesCount?: number;
  layoutMode?: "ledger" | "melting" | "grid";
  hasCreditDebit?: boolean;
  detectedReportType?: string;
  dataMerges?: Record<string, MergedCellSpan>;
}

export interface ReportFilterOptions {
  types: string[];
  owners: string[];
  statuses: string[];
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
  headers?: string[];
  headerStructure?: HeaderStructure;
  createdAt?: string | Date;
}

export interface UserItem {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: string;
  mobileNumber?: string;
  department?: string;
  avatar?: string;
  bio?: string;
  notifications?: UserNotificationPreferences;
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

export interface AuditTimelineAction {
  id?: string;
  timestamp: string;
  module: string;
  section: string;
  action: AuditActionType;
  details?: string;
}

export interface AuditSessionLog {
  id?: string;
  _id?: string;
  sessionId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  loginTime: string;
  logoutTime?: string | null;
  status: "Active" | "Completed";
  duration?: string;
  ipAddress?: string;
  userAgent?: string;
  totalActions: number;
  timeline: AuditTimelineAction[];
}

export interface AuditLogMetrics {
  totalLogs: number;
  activeUsersToday: number;
  topModule: string;
  securityEvents: number;
}

export interface AuditLogResponse {
  success: boolean;
  data: AuditSessionLog[];
  total: number;
  page: number;
  pages: number;
  metrics: AuditLogMetrics;
  error?: string;
}
