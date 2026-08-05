# Implementation Plan - Dynamic Activity Log (Audit Log) Feature

Build a comprehensive, real-time dynamic Activity Log (Audit Log) system across the CRM. Whenever any user performs any action (Login, Logout, View Page/Report, Add, Update, Delete, Export, Permission Change) on any module, the system records detailed audit logs accessible exclusively to the **Super Admin**.

## User Review Required

> [!IMPORTANT]
> - **Super Admin Access**: As specified, access to the Activity Log tab will be strictly restricted to the `Super Admin` role on both backend and frontend. Non-Super Admin users will see an access restriction notice if they attempt to view the audit log page.
> - **Automatic Tracking**: The system will automatically log actions on the backend (User CRUD, Role/Permissions changes, Report CRUD/Status changes, Auth events) as well as page views and export actions triggered from the frontend.

## Proposed Changes

### Shared & Backend Architecture

#### [NEW] [api.ts](file:///Users/user/Raj/sg-reports/shared/api.ts)
- Add `AuditLogItem` interface representing audit log records.
- Add `AuditLogResponse` and `AuditLogMetrics` interfaces.

#### [NEW] [AuditLog.ts](file:///Users/user/Raj/sg-reports/backend/src/models/AuditLog.ts)
- Define `AuditLog` Mongoose schema & model.
- Include fallback in-memory store for seamless operation if running in degraded MongoDB state.

#### [NEW] [auditLogger.ts](file:///Users/user/Raj/sg-reports/backend/src/utils/auditLogger.ts)
- Central `logActivity` helper function.

#### [NEW] [auditLogs.ts](file:///Users/user/Raj/sg-reports/backend/src/routes/auditLogs.ts)
- Implement `GET /api/audit-logs` and `POST /api/audit-logs`.

#### [MODIFY] Router Files
- Instrument backend routes (`auth.ts`, `users.ts`, `roles.ts`, `reports.ts`, `reportTypes.ts`, `approvals.ts`) to log actions.
- Register `auditLogsRouter` in `backend/src/index.ts`.

### Frontend UI & Client Integration

#### [NEW] [AuditLogView.tsx](file:///Users/user/Raj/sg-reports/frontend/src/components/dashboard/AuditLogView.tsx)
- Create modern, clean Audit Log dashboard component for Super Admin with metrics, search/filters, interactive data table, and access restrictions.

#### [MODIFY] [Index.tsx](file:///Users/user/Raj/sg-reports/frontend/src/pages/Index.tsx)
- Add "Activity Log" under Administration in nav groups (visible to Super Admin).
- Integrate real-time action & page navigation tracking.

## Verification Plan

### Automated Verification
- Run `pnpm typecheck` to verify TypeScript interfaces.

### Manual Verification
1. Log in as Super Admin and verify "Login" audit event.
2. Perform actions across modules (create report, update user, edit role, change permissions, export data).
3. Test search, filters (Module, Action, Role, Date), pagination, and detail modal in the Activity Log tab.
4. Verify non-Super Admin users cannot access audit logs.
