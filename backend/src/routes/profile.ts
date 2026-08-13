import { Router } from "express";
import bcrypt from "bcryptjs";
import { authenticateToken, AuthRequest, generateToken } from "../middleware/auth";
import { UserModel } from "../models/User";
import { RoleModel } from "../models/Role";
import { getDefaultModulePermissions } from "./roles";
import { getDBStatus } from "../db";
import { logActivity } from "../utils/auditLogger";
import { UserSession } from "@shared/api";

export const profileRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/profile — Fetch current user's profile and active permissions
// ─────────────────────────────────────────────────────────────────────────────
profileRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Unauthorized access." });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const dbUser = await UserModel.findOne({ email: req.user.email.toLowerCase() }).select("-password");

    if (!dbUser) {
      return res.status(404).json({ success: false, error: "User profile not found." });
    }

    // Fetch role permissions
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

    const profileData: UserSession & { _id: string; createdAt?: Date; status: string } = {
      _id: (dbUser._id as { toString(): string }).toString(),
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      mobileNumber: dbUser.mobileNumber || "",
      department: dbUser.department || "",
      avatar: dbUser.avatar || "",
      bio: dbUser.bio || "",
      notifications: dbUser.notifications || {
        emailAlerts: true,
        approvalReminders: true,
        weeklyDigest: false,
      },
      authenticatedAt: req.user.authenticatedAt || new Date().toISOString(),
      modulePermissions,
      createdAt: dbUser.createdAt,
      status: dbUser.status,
    };

    res.json({
      success: true,
      data: profileData,
      message: "Profile retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/profile — Update user personal profile information
// ─────────────────────────────────────────────────────────────────────────────
profileRouter.put("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Unauthorized access." });
    }

    const { name, email, mobileNumber, department, avatar, bio, notifications, role } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Full name cannot be empty.", field: "name" });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const dbUser = await UserModel.findOne({ email: req.user.email.toLowerCase() });
    if (!dbUser) {
      return res.status(404).json({ success: false, error: "User profile not found." });
    }

    if (email && email.trim()) {
      const newEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        return res.status(400).json({ success: false, error: "Please enter a valid email address.", field: "email" });
      }

      if (newEmail !== dbUser.email.toLowerCase()) {
        const existingUser = await UserModel.findOne({ email: newEmail });
        if (existingUser) {
          return res.status(400).json({ success: false, error: "This email address is already in use by another account.", field: "email" });
        }
        dbUser.email = newEmail;
      }
    }

    // Role modification check: only Admins / Super Admins can alter roles
    const isAdmin = req.user.role === "Super Admin" || req.user.role === "Administrator";
    let finalRole = dbUser.role;
    if (role && role.trim() !== dbUser.role) {
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to change your own user role. Please contact a workspace administrator.",
          field: "role",
        });
      }
      finalRole = role.trim();
    }

    dbUser.name = name.trim();
    if (typeof mobileNumber === "string") dbUser.mobileNumber = mobileNumber.trim();
    if (typeof department === "string") dbUser.department = department.trim();
    if (typeof avatar === "string") dbUser.avatar = avatar;
    if (typeof bio === "string") dbUser.bio = bio.trim();
    dbUser.role = finalRole;

    if (notifications && typeof notifications === "object") {
      dbUser.notifications = {
        emailAlerts: typeof notifications.emailAlerts === "boolean" ? notifications.emailAlerts : (dbUser.notifications?.emailAlerts ?? true),
        approvalReminders: typeof notifications.approvalReminders === "boolean" ? notifications.approvalReminders : (dbUser.notifications?.approvalReminders ?? true),
        weeklyDigest: typeof notifications.weeklyDigest === "boolean" ? notifications.weeklyDigest : (dbUser.notifications?.weeklyDigest ?? false),
      };
    }

    await dbUser.save();

    // Re-fetch role permissions
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

    const updatedUserSession: UserSession & { _id: string; createdAt?: Date; status: string } = {
      _id: (dbUser._id as { toString(): string }).toString(),
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      mobileNumber: dbUser.mobileNumber,
      department: dbUser.department,
      avatar: dbUser.avatar,
      bio: dbUser.bio,
      notifications: dbUser.notifications,
      authenticatedAt: req.user.authenticatedAt || new Date().toISOString(),
      modulePermissions,
      createdAt: dbUser.createdAt,
      status: dbUser.status,
    };

    const { token: newToken } = generateToken(updatedUserSession);

    await logActivity(req, {
      module: "Profile",
      section: "Personal Details",
      action: "Update",
      details: `User ${dbUser.name} (${dbUser.email}) updated profile information.`,
    });

    res.json({
      success: true,
      data: updatedUserSession,
      token: newToken,
      message: "Profile updated successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/profile/password — Change user password securely
// ─────────────────────────────────────────────────────────────────────────────
profileRouter.post("/password", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Unauthorized access." });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !currentPassword.trim()) {
      return res.status(400).json({ success: false, error: "Current password is required.", field: "currentPassword" });
    }

    if (!newPassword || !newPassword.trim()) {
      return res.status(400).json({ success: false, error: "New password is required.", field: "newPassword" });
    }

    if (newPassword.trim().length < 8) {
      return res.status(400).json({ success: false, error: "New password must be at least 8 characters long.", field: "newPassword" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: "New password and confirmation do not match.", field: "confirmPassword" });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const dbUser = await UserModel.findOne({ email: req.user.email.toLowerCase() }).select("+password");
    if (!dbUser || !dbUser.password) {
      return res.status(404).json({ success: false, error: "User account record not found." });
    }

    // Verify current password (supports bcrypt hashes & legacy plaintext)
    const isCurrentValid = dbUser.password.startsWith("$2")
      ? await bcrypt.compare(currentPassword.trim(), dbUser.password)
      : dbUser.password === currentPassword.trim();

    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        error: "Incorrect current password. Please verify your existing password.",
        field: "currentPassword",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword.trim(), 12);
    dbUser.password = hashedPassword;
    await dbUser.save();

    await logActivity(req, {
      module: "Profile",
      section: "Security & Password",
      action: "Update",
      details: `User ${dbUser.name} (${dbUser.email}) successfully changed their account password.`,
    });

    res.json({
      success: true,
      message: "Password updated successfully. Your new password is now active.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
