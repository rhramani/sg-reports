import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env") });
dotenv.config();

import express from "express";
import cors from "cors";
import { connectDB, getDBStatus } from "./db";
import { authRouter } from "./routes/auth";
import { reportsRouter } from "./routes/reports";
import { dashboardRouter } from "./routes/dashboard";
import { approvalsRouter } from "./routes/approvals";
import { usersRouter } from "./routes/users";
import { rolesRouter } from "./routes/roles";
import { reportTypesRouter } from "./routes/reportTypes";
import { auditLogsRouter } from "./routes/auditLogs";
import { profileRouter } from "./routes/profile";
import { authenticateToken } from "./middleware/auth";

export function createServer() {
  const app = express();

  // Connect to MongoDB asynchronously
  connectDB().catch((err) => {
    console.warn("MongoDB initial connection error:", err);
  });

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // API Health & Status Routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/db-status", (_req, res) => {
    const dbStatus = getDBStatus();
    res.json({
      success: true,
      database: dbStatus,
      mongodbUriConfigured: Boolean(process.env.MONGODB_URI),
    });
  });

  // Modular Routers for all UI features
  app.use("/api/auth", authRouter);
  app.use("/api/profile", authenticateToken, profileRouter);
  app.use("/api/reports", authenticateToken, reportsRouter);
  app.use("/api/dashboard", authenticateToken, dashboardRouter);
  app.use("/api/approvals", authenticateToken, approvalsRouter);
  app.use("/api/users", authenticateToken, usersRouter);
  app.use("/api/roles", authenticateToken, rolesRouter);
  app.use("/api/report-types", authenticateToken, reportTypesRouter);
  app.use("/api/audit-logs", authenticateToken, auditLogsRouter);

  // Fallback 404 JSON handler for unhandled /api routes (prevents HTML fallback)
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: "API endpoint not found",
    });
  });

  return app;
}

// ── Standalone dev server ──────────────────────────────────────────────────
// Only start listening when this file is the entry point (tsx watch src/index.ts)
const port = Number(process.env.PORT) || 3000;
const app = createServer();
app.listen(port, () => {
  console.log(`🚀 Backend API running on http://localhost:${port}`);
  console.log(`🔧 API base:             http://localhost:${port}/api`);
});
