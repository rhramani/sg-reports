# Walkthrough - Activity Log (Audit Log) Feature

We have implemented a dynamic, real-time **Activity Log (Audit Log)** feature across the CRM. The system tracks every user action (Login, Logout, Page Navigation, View, Add, Update, Delete, Export, Permission Changes) and presents a searchable, filterable dashboard exclusively accessible to the **Super Admin**.

---

## 🌟 What Was Built

### 1. Shared Data Models & Types
- Added `AuditLogItem`, `AuditLogMetrics`, `AuditLogResponse`, and `AuditActionType` in [api.ts](file:///Users/user/Raj/sg-reports/shared/api.ts).

### 2. Backend Logging & Storage Infrastructure
- **Mongoose Model**: Created [AuditLog.ts](file:///Users/user/Raj/sg-reports/backend/src/models/AuditLog.ts) with indexes on timestamp, user email, module, action, and user role. Included an in-memory fallback dataset for degraded DB mode.
- **Central Audit Utility**: Created [auditLogger.ts](file:///Users/user/Raj/sg-reports/backend/src/utils/auditLogger.ts) to capture user session context, timestamp, IP address, module, action, and record affected.
- **Audit Log Router**: Created [auditLogs.ts](file:///Users/user/Raj/sg-reports/backend/src/routes/auditLogs.ts) with `GET /api/audit-logs` (Super Admin restricted, searchable, filterable, paginated, with summary metrics) and `POST /api/audit-logs` for explicit action logging.
- **Backend Instrumentation**: Instrumented all core routes:
  - Auth: [auth.ts](file:///Users/user/Raj/sg-reports/backend/src/routes/auth.ts) (Login success, password failure, and Logout)
  - Users: [users.ts](file:///Users/user/Raj/sg-reports/backend/src/routes/users.ts) (Create User, Edit User, Status Toggle, Delete User)
  - Roles: [roles.ts](file:///Users/user/Raj/sg-reports/backend/src/routes/roles.ts) (Create Role, Rename Role, Status Toggle, Delete Role, Permission Matrix Update)
  - Reports: [reports.ts](file:///Users/user/Raj/sg-reports/backend/src/routes/reports.ts) (Upload Report, Edit Report, Status Toggle, Delete Report, Approval Queue)
  - Registered `/api/audit-logs` router in [index.ts](file:///Users/user/Raj/sg-reports/backend/src/index.ts).

### 3. Super Admin Activity Log Dashboard UI
- **Component**: Built [AuditLogView.tsx](file:///Users/user/Raj/sg-reports/frontend/src/components/dashboard/AuditLogView.tsx):
  - **Metrics Header**: Real-time counters for Total Activities, Active Users Today, Top Active Module, and Security Events.
  - **Search & Filters**: Search box (by user, email, module, section, IP, details), Module filter, Action filter, Role filter, and Date Range filter.
  - **Data Table**: Displays user name & email avatar, role badge, module name, section/record affected, color-coded action badge (Add, Update, Delete, View, Export, Login, Logout), timestamp, relative time, and IP address.
  - **Log Details Modal**: Clickable detail viewer showing full telemetry payload and exact UTC timestamp.
  - **Access Guard**: Non-Super Admin accounts trying to view the tab receive a clean "Super Admin Access Required" notice.
- **Main View & Navigation Integration**: Updated [Index.tsx](file:///Users/user/Raj/sg-reports/frontend/src/pages/Index.tsx):
  - Added "Activity Log" link under "Administration" in the sidebar menu (visible only to Super Admin).
  - Added auto-tracking for page view navigation and CSV export events.

---

## 🧪 Verification & Results

- **TypeScript Compilation**: Executed `pnpm typecheck` across all 3 workspace projects (`backend`, `frontend`, `shared`) — **0 errors**.
- **Production Build**: Executed `pnpm build` — Vite SPA frontend and SSR backend compiled successfully.
