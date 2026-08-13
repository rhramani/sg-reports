import { Router } from "express";
import bcrypt from "bcryptjs";
import { getDBStatus } from "../db";
import { UserModel } from "../models/User";
import { UserItem } from "@shared/api";
import { authorizeRoles, AuthRequest } from "../middleware/auth";
import { logActivity } from "../utils/auditLogger";

export const usersRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users — list all workspace users
// ─────────────────────────────────────────────────────────────────────────────
usersRouter.get("/", async (_req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }
    const users = await UserModel.find().sort({ createdAt: -1 }).select("-password");
    res.json({
      success: true,
      data: users,
      message: "Workspace users retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/create — create a new user (Super Admin only)
// ─────────────────────────────────────────────────────────────────────────────
usersRouter.post(
  "/create",
  authorizeRoles("Super Admin"),
  async (req: AuthRequest, res) => {
    try {
      const { name, email, password, role } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        role?: string;
      };

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: "Full name is required.", field: "name" });
      }
      if (!email || !email.trim()) {
        return res.status(400).json({ success: false, error: "Email address is required.", field: "email" });
      }
      if (!password || !password.trim()) {
        return res.status(400).json({ success: false, error: "Password is required.", field: "password" });
      }
      if (password.trim().length < 8) {
        return res.status(400).json({ success: false, error: "Password must be at least 8 characters.", field: "password" });
      }

      const cleanEmail = email.trim().toLowerCase();
      const dbStatus = getDBStatus();
      if (dbStatus.stateCode !== 1) {
        return res.status(503).json({ success: false, error: "Database unavailable. Cannot create user." });
      }

      const existing = await UserModel.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: "A user with this email already exists.",
          field: "email",
        });
      }

      const hashedPassword = await bcrypt.hash(password.trim(), 12);
      const created = await UserModel.create({
        name: name.trim(),
        email: cleanEmail,
        password: hashedPassword,
        role: role?.trim() || "Report Analyst",
        status: "Active",
        lastActive: "Invited",
      });

      const userOut: UserItem = {
        _id: (created._id as { toString(): string }).toString(),
        name: created.name,
        email: created.email,
        role: created.role,
        lastActive: created.lastActive,
        status: created.status,
      };

      await logActivity(req, {
        module: "Users",
        section: `User ${created.name}`,
        action: "Add",
        details: `Created new user account for ${created.email} with role "${created.role}".`,
      });

      res.status(201).json({
        success: true,
        data: userOut,
        message: `User "${created.name}" created successfully. They can now log in with their credentials.`,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/:id — edit user name, email, role (Super Admin only)
// ─────────────────────────────────────────────────────────────────────────────
usersRouter.put(
  "/:id",
  authorizeRoles("Super Admin"),
  async (req: AuthRequest, res) => {
    try {
      const { name, email, role } = req.body as {
        name?: string;
        email?: string;
        role?: string;
      };

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: "Full name is required." });
      }
      if (!email || !email.trim()) {
        return res.status(400).json({ success: false, error: "Email address is required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const dbStatus = getDBStatus();
      if (dbStatus.stateCode !== 1) {
        return res.status(503).json({ success: false, error: "Database unavailable." });
      }

      // Check duplicate email (excluding current user)
      const duplicate = await UserModel.findOne({ email: cleanEmail, _id: { $ne: req.params.id } });
      if (duplicate) {
        return res.status(409).json({ success: false, error: "Another user with this email already exists." });
      }

      const updated = await UserModel.findByIdAndUpdate(
        req.params.id,
        { name: name.trim(), email: cleanEmail, role: role?.trim() || "Report Analyst" },
        { new: true }
      ).select("-password");

      if (!updated) {
        return res.status(404).json({ success: false, error: "User not found." });
      }

      await logActivity(req, {
        module: "Users",
        section: `User ${updated.name}`,
        action: "Update",
        details: `Updated user details for ${updated.email} (Role: "${updated.role}").`,
      });

      res.json({
        success: true,
        data: updated,
        message: `User "${updated.name}" updated successfully.`,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/:id/status — toggle user status (Super Admin only)
// ─────────────────────────────────────────────────────────────────────────────
usersRouter.patch(
  "/:id/status",
  authorizeRoles("Super Admin"),
  async (req: AuthRequest, res) => {
    try {
      const { status } = req.body as { status?: string };
      const allowed = ["Active", "Inactive", "Pending"];
      if (!status || !allowed.includes(status)) {
        return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(", ")}` });
      }

      const dbStatus = getDBStatus();
      if (dbStatus.stateCode !== 1) {
        return res.status(503).json({ success: false, error: "Database unavailable." });
      }

      const updated = await UserModel.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).select("-password");

      if (!updated) {
        return res.status(404).json({ success: false, error: "User not found." });
      }

      await logActivity(req, {
        module: "Users",
        section: `User ${updated.name}`,
        action: "Update",
        details: `Toggled user status to "${status}" for ${updated.email}.`,
      });

      res.json({
        success: true,
        data: updated,
        message: `User status updated to "${status}" successfully.`,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/:id — delete a user (Super Admin only)
// ─────────────────────────────────────────────────────────────────────────────
usersRouter.delete(
  "/:id",
  authorizeRoles("Super Admin"),
  async (req: AuthRequest, res) => {
    try {
      const dbStatus = getDBStatus();
      if (dbStatus.stateCode !== 1) {
        return res.status(503).json({ success: false, error: "Database unavailable." });
      }

      const deleted = await UserModel.findByIdAndDelete(req.params.id).select("-password");
      if (!deleted) {
        return res.status(404).json({ success: false, error: "User not found." });
      }

      await logActivity(req, {
        module: "Users",
        section: `User ${deleted.name}`,
        action: "Delete",
        details: `Deleted user account for ${deleted.email}.`,
      });

      res.json({
        success: true,
        message: `User "${deleted.name}" deleted successfully.`,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);
