import { Router } from "express";
import { getDBStatus } from "../db";
import { RoleModel, IModulePermission } from "../models/Role";
import { AuthRequest } from "../middleware/auth";
import { logActivity } from "../utils/auditLogger";

export const rolesRouter = Router();

const DEFAULT_MODULES = [
  "Dashboard",
  "Reports",
  "Approvals",
  "Users",
  "Roles",
  "Permissions",
  "Report types",
];

export function getDefaultModulePermissions(roleName: string): IModulePermission[] {
  const isSuperAdmin = roleName === "Super Admin";
  const isAdmin = !isSuperAdmin && roleName.toLowerCase().includes("admin");
  const isSupervisor = roleName.toLowerCase().includes("supervisor");
  const isAnalyst = roleName.toLowerCase().includes("analyst");

  return DEFAULT_MODULES.map((mod) => {
    // The Permissions tab is strictly reserved for Super Admin only
    if (mod === "Permissions") {
      return {
        module: mod,
        actions: {
          view: isSuperAdmin,
          add: isSuperAdmin,
          update: isSuperAdmin,
          delete: isSuperAdmin,
          export: isSuperAdmin,
        },
      };
    }

    if (isSuperAdmin || isAdmin) {
      return {
        module: mod,
        actions: { view: true, add: true, update: true, delete: true, export: true },
      };
    }
    if (isSupervisor) {
      const isApprovalOrReport = mod === "Approvals" || mod === "Reports" || mod === "Dashboard";
      return {
        module: mod,
        actions: {
          view: true,
          add: isApprovalOrReport,
          update: isApprovalOrReport,
          delete: false,
          export: true,
        },
      };
    }
    if (isAnalyst) {
      const isReport = mod === "Reports" || mod === "Dashboard";
      return {
        module: mod,
        actions: {
          view: true,
          add: isReport,
          update: isReport,
          delete: false,
          export: isReport,
        },
      };
    }
    // Default Viewer / standard fallback
    return {
      module: mod,
      actions: { view: true, add: false, update: false, delete: false, export: false },
    };
  });
}

// GET /api/roles
rolesRouter.get("/", async (_req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }
    const roles = await RoleModel.find().sort({ createdAt: -1 });
    
    // Ensure every role has populated modulePermissions
    const populated = roles.map((r) => {
      const doc = r.toObject();
      if (!doc.modulePermissions || doc.modulePermissions.length === 0) {
        doc.modulePermissions = getDefaultModulePermissions(doc.role);
      }
      return doc;
    });

    res.json({
      success: true,
      data: populated,
      message: "Workspace roles retrieved successfully from database.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/roles/:id/permissions
rolesRouter.get("/:id/permissions", async (req, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const role = await RoleModel.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, error: "Role not found." });
    }

    const modulePermissions =
      role.modulePermissions && role.modulePermissions.length > 0
        ? role.modulePermissions
        : getDefaultModulePermissions(role.role);

    res.json({
      success: true,
      data: {
        roleId: role._id,
        role: role.role,
        modulePermissions,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/roles/:id/permissions — update module permissions
rolesRouter.put("/:id/permissions", async (req, res) => {
  try {
    const { modulePermissions } = req.body;
    if (!Array.isArray(modulePermissions)) {
      return res.status(400).json({
        success: false,
        error: "Invalid permissions payload. Expected array of modulePermissions.",
      });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const updated = await RoleModel.findByIdAndUpdate(
      req.params.id,
      { modulePermissions },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Role not found." });
    }

    await logActivity(req, {
      module: "Permissions",
      section: `Role ${updated.role}`,
      action: "Update",
      details: `Updated permission action matrix for role "${updated.role}".`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Permissions updated successfully for role '${updated.role}'.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/roles — create role
rolesRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { role } = req.body;
    if (!role || !role.trim()) {
      return res.status(400).json({ success: false, error: "Role name is required." });
    }

    const cleanRoleName = role.trim();
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot create role.",
      });
    }

    const defaultPerms = getDefaultModulePermissions(cleanRoleName);

    const created = await RoleModel.create({
      role: cleanRoleName,
      permissions: "Configured via Permissions Tab",
      modulePermissions: defaultPerms,
      members: 0,
      created: new Date().toISOString().split("T")[0],
      status: "Active",
    });

    await logActivity(req, {
      module: "Roles",
      section: `Role ${cleanRoleName}`,
      action: "Add",
      details: `Created workspace role "${cleanRoleName}".`,
    });

    res.status(201).json({
      success: true,
      data: created,
      message: `Role '${cleanRoleName}' created and stored in database.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/roles/:id — edit role
rolesRouter.put("/:id", async (req: AuthRequest, res) => {
  try {
    const { role } = req.body;
    if (!role || !role.trim()) {
      return res.status(400).json({ success: false, error: "Role name is required." });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const updated = await RoleModel.findByIdAndUpdate(
      req.params.id,
      { role: role.trim() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Role not found." });
    }

    await logActivity(req, {
      module: "Roles",
      section: `Role ${updated.role}`,
      action: "Update",
      details: `Renamed role to "${updated.role}".`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Role '${updated.role}' updated successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /api/roles/:id/status — toggle role status
rolesRouter.patch("/:id/status", async (req: AuthRequest, res) => {
  try {
    const { status } = req.body as { status?: string };
    const allowed = ["Active", "Inactive"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(", ")}` });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const updated = await RoleModel.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Role not found." });
    }

    await logActivity(req, {
      module: "Roles",
      section: `Role ${updated.role}`,
      action: "Update",
      details: `Toggled role status to "${status}" for "${updated.role}".`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Role status updated to "${status}".`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /api/roles/:id — delete role
rolesRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({ success: false, error: "Database unavailable." });
    }

    const deleted = await RoleModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Role not found." });
    }

    await logActivity(req, {
      module: "Roles",
      section: `Role ${deleted.role}`,
      action: "Delete",
      details: `Deleted workspace role "${deleted.role}".`,
    });

    res.json({
      success: true,
      message: `Role '${deleted.role}' deleted successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});


