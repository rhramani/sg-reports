import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import type { Server } from "node:http";

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
import { categoryRouter } from "./routes/category";
import { jewelleryTransactionsRouter } from "./routes/jewelleryTransactions";
import { courierRouter } from "./routes/courier";
import { authenticateToken } from "./middleware/auth";

export function createServer() {
  const app = express();

  // Connect to MongoDB asynchronously
  connectDB().catch((err) => {
    console.warn("MongoDB initial connection error:", err);
  });

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

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
  app.use("/api/categories", authenticateToken, categoryRouter);
  app.use("/api/jewellery-transactions", authenticateToken, jewelleryTransactionsRouter);
  app.use("/api/courier", authenticateToken, courierRouter);

  // Fallback 404 JSON handler for unhandled /api routes (prevents HTML fallback)
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: "API endpoint not found",
    });
  });

  return app;
}

import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Starts listening on initialPort, automatically falling back to subsequent ports
 * if the desired port is already in use (EADDRINUSE).
 */
export function startServerWithFallback(
  app: express.Express,
  initialPort: number,
  maxAttempts = 50,
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    let currentPort = initialPort;
    let attempts = 0;

    function tryListen() {
      const server = http.createServer(app);

      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          attempts++;
          if (attempts >= maxAttempts) {
            reject(
              new Error(
                `No available ports found after ${maxAttempts} attempts starting from ${initialPort}`,
              ),
            );
            return;
          }
          console.warn(
            `⚠️  Port ${currentPort} is already in use. Retrying on port ${currentPort + 1}...`,
          );
          currentPort++;
          tryListen();
        } else {
          reject(err);
        }
      });

      server.listen(currentPort, () => {
        const addr = server.address() as AddressInfo;
        const boundPort = addr ? addr.port : currentPort;
        resolve({ server, port: boundPort });
      });
    }

    tryListen();
  });
}

// ── Standalone dev server ──────────────────────────────────────────────────
// Only start listening when this file is the entry point (tsx watch src/index.ts)
const initialPort = Number(process.env.PORT) || 3000;
const app = createServer();

startServerWithFallback(app, initialPort)
  .then(({ port }) => {
    console.log(`🚀 Backend API running on http://localhost:${port}`);
    console.log(`🔧 API base:             http://localhost:${port}/api`);

    // Record active port to .backend-port in the workspace root for frontend proxy
    try {
      const portFilePath = path.resolve(import.meta.dirname, "../../.backend-port");
      fs.writeFileSync(portFilePath, String(port), "utf-8");
    } catch {}

    const cleanupPortFile = () => {
      try {
        const portFilePath = path.resolve(import.meta.dirname, "../../.backend-port");
        if (fs.existsSync(portFilePath)) {
          fs.unlinkSync(portFilePath);
        }
      } catch {}
    };

    process.on("exit", cleanupPortFile);
    process.on("SIGINT", () => {
      cleanupPortFile();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanupPortFile();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });
