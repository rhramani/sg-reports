import { Router } from "express";
import bcrypt from "bcryptjs";
import { LoginRequest, LoginResponse, UserSession } from "@shared/api";
import { generateToken, authenticateToken, AuthRequest } from "../middleware/auth";
import { UserModel } from "../models/User";
import { RoleModel } from "../models/Role";
import { getDefaultModulePermissions } from "./roles";
import { getDBStatus } from "../db";
import { logActivity } from "../utils/auditLogger";

export const authRouter = Router();

export function getDefaultSuperAdmin() {
  return {
    name: process.env.SUPER_ADMIN_NAME || "Super Administrator",
    email: process.env.SUPER_ADMIN_EMAIL || "superadmin@nexora.com",
    password: process.env.SUPER_ADMIN_PASSWORD || "",
    role: "Super Admin",
    status: "Active" as const,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Validates email & password against MongoDB.
// Returns specific errors: email not found, incorrect password, inactive account.
// ─────────────────────────────────────────────────────────────────────────────
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password }: LoginRequest = req.body || {};

    // ── 1. Input validation ───────────────────────────────────────
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: "Email is required to sign in.",
        field: "email",
      });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({
        success: false,
        error: "Password is required to sign in.",
        field: "password",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ── 2. DB connection check ────────────────────────────────────
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    // ── 3. Look up user by email ──────────────────────────────────
    const dbUser = await UserModel.findOne({ email: cleanEmail }).select("+password");

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        error: "Email not found. No account is registered with this email address.",
        field: "email",
      });
    }

    // ── 4. Check account status ───────────────────────────────────
    if (dbUser.status === "Inactive") {
      return res.status(403).json({
        success: false,
        error: "Account is inactive. Please contact your workspace administrator.",
      });
    }

    if (dbUser.status === "Pending") {
      return res.status(403).json({
        success: false,
        error: "Account is pending approval. Please wait for administrator activation.",
      });
    }

    // ── 5. Verify password ────────────────────────────────────────
    if (!dbUser.password) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials. Please contact your administrator to reset your password.",
      });
    }

    // Support both bcrypt hashes and legacy plaintext passwords
    const isValidPassword = dbUser.password.startsWith("$2")
      ? await bcrypt.compare(password.trim(), dbUser.password)
      : dbUser.password === password.trim();

    if (!isValidPassword) {
      await logActivity(req, {
        userName: dbUser.name || cleanEmail,
        userEmail: cleanEmail,
        userRole: dbUser.role || "Unknown",
        module: "Auth",
        section: "Login Screen",
        action: "Login",
        details: "Failed login attempt (incorrect password).",
      });

      return res.status(401).json({
        success: false,
        error: "Incorrect password. Please check your credentials and try again.",
        field: "password",
      });
    }

    // ── 6. Update last active timestamp ──────────────────────────
    dbUser.lastActive = "Active now";
    await dbUser.save();

    // ── Fetch module permissions for user's role ─────────────────
    let modulePermissions;
    try {
      const roleDoc = await RoleModel.findOne({ role: dbUser.role });
      if (roleDoc && roleDoc.modulePermissions && roleDoc.modulePermissions.length > 0) {
        modulePermissions = roleDoc.modulePermissions;
      } else {
        modulePermissions = getDefaultModulePermissions(dbUser.role);
      }
    } catch {
      modulePermissions = getDefaultModulePermissions(dbUser.role);
    }

    // ── 7. Issue JWT token ────────────────────────────────────────
    const baseUser: UserSession = {
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      modulePermissions,
      authenticatedAt: new Date().toISOString(),
    };

    const { token, expiresAt } = generateToken(baseUser);
    const user: UserSession = { ...baseUser, expiresAt };

    await logActivity(req, {
      userName: dbUser.name,
      userEmail: dbUser.email,
      userRole: dbUser.role,
      module: "Auth",
      section: "Login Screen",
      action: "Login",
      details: `${dbUser.name} signed in successfully.`,
    });

    const response: LoginResponse = {
      success: true,
      token,
      expiresAt,
      user,
      message: "Login successful.",
    };

    return res.json(response);
  } catch (error) {
    // Log the full error server-side only – never expose internals to the client
    console.error("[auth/login] Internal error:", error);
    return res.status(500).json({
      success: false,
      error: "An internal server error occurred. Please try again later or contact support.",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout — log user logout action
// ─────────────────────────────────────────────────────────────────────────────
authRouter.post("/logout", authenticateToken, async (req: AuthRequest, res) => {
  if (req.user) {
    await logActivity(req, {
      module: "Auth",
      section: "User Session",
      action: "Logout",
      details: `${req.user.name} logged out.`,
    });
  }
  return res.json({ success: true, message: "Logged out successfully." });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me — verify active session and return updated role permissions
// ─────────────────────────────────────────────────────────────────────────────
authRouter.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  let modulePermissions = req.user.modulePermissions;
  try {
    const roleDoc = await RoleModel.findOne({ role: req.user.role });
    if (roleDoc && roleDoc.modulePermissions && roleDoc.modulePermissions.length > 0) {
      modulePermissions = roleDoc.modulePermissions;
    } else {
      modulePermissions = getDefaultModulePermissions(req.user.role);
    }
  } catch {
    modulePermissions = getDefaultModulePermissions(req.user.role);
  }

  res.json({
    success: true,
    user: {
      ...req.user,
      modulePermissions,
    },
    message: "Active session verified",
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/seed-admin — (re)create the default super admin user in MongoDB
// Uses bcrypt to hash the password before saving
// ─────────────────────────────────────────────────────────────────────────────
authRouter.post("/seed-admin", async (_req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is unavailable. Cannot seed admin.",
      });
    }

    const adminData = getDefaultSuperAdmin();
    if (!adminData.password) {
      return res.status(400).json({
        success: false,
        error: "SUPER_ADMIN_PASSWORD environment variable is not set.",
      });
    }

    const hashedPassword = await bcrypt.hash(adminData.password, 12);

    const mongoRecord = await UserModel.findOneAndUpdate(
      { email: adminData.email },
      {
        name: adminData.name,
        email: adminData.email,
        password: hashedPassword,
        role: adminData.role,
        status: "Active",
        lastActive: "Active now",
      },
      { upsert: true, new: true }
    );

    const { token, expiresAt } = generateToken({
      email: adminData.email,
      name: adminData.name,
      role: adminData.role,
      authenticatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: "Super Admin user credentials generated and saved to MongoDB.",
      credentials: {
        email: adminData.email,
        role: adminData.role,
        name: adminData.name,
      },
      token,
      expiresAt,
      mongoSaved: Boolean(mongoRecord),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
