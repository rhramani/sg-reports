import { Router } from "express";
import crypto from "crypto";
import { getDBStatus } from "../db";
import { ReportModel } from "../models/Report";
import { ReportTypeModel } from "../models/ReportType";
import { ReportItem, HeaderStructure } from "@shared/api";
import { AuthRequest, authenticateToken } from "../middleware/auth";
import { logActivity } from "../utils/auditLogger";
import { syncReportTypes } from "../utils/reportTypeSyncer";

import { RoleModel } from "../models/Role";

export const reportsRouter = Router();

export async function buildRoleScopeFilter(req: AuthRequest): Promise<Record<string, unknown>> {
  const userRole = req.user?.role || "";
  const isSuperAdmin = userRole === "Super Admin";
  const isAdmin = isSuperAdmin || userRole === "Administrator" || userRole === "Admin" || userRole.toLowerCase().includes("admin");

  if (isAdmin || !userRole) {
    return {};
  }

  let roleIdStr = "";
  try {
    const roleDoc = await RoleModel.findOne({ role: { $regex: `^${escapeRegex(userRole)}$`, $options: "i" } });
    if (roleDoc) {
      roleIdStr = (roleDoc._id as { toString(): string }).toString();
    }
  } catch {}

  const escapedRole = escapeRegex(userRole);
  const matchConditions: Record<string, unknown>[] = [
    { ownerRole: { $regex: `^${escapedRole}$`, $options: "i" } },
  ];

  if (roleIdStr) {
    matchConditions.unshift({ roleId: roleIdStr });
  }

  return { $or: matchConditions };
}

function computeContentHash(data: unknown[]): string {
  if (!Array.isArray(data) || data.length === 0) return "";
  try {
    const jsonStr = JSON.stringify(data);
    return crypto.createHash("sha256").update(jsonStr).digest("hex");
  } catch {
    return "";
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getRoleInfo(roleName: string) {
  const cleanRole = (roleName || "").trim();
  if (!cleanRole) {
    return { roleName: "User", isAdmin: false, isSuperAdmin: false, roleId: "" };
  }
  try {
    const roleDoc = await RoleModel.findOne({
      role: { $regex: `^${escapeRegex(cleanRole)}$`, $options: "i" },
    });
    if (roleDoc) {
      const dbRoleName = roleDoc.role.trim();
      const lowerRole = dbRoleName.toLowerCase();
      const isSuperAdmin = lowerRole === "super admin";
      const isAdmin =
        isSuperAdmin ||
        lowerRole.includes("admin") ||
        (roleDoc.permissions && roleDoc.permissions.toLowerCase().includes("admin"));
      return {
        roleName: dbRoleName,
        isAdmin,
        isSuperAdmin,
        roleId: (roleDoc._id as { toString(): string }).toString(),
        doc: roleDoc,
      };
    }
  } catch (err) {
    console.error("Error looking up role in DB:", err);
  }
  const lowerRole = cleanRole.toLowerCase();
  const isSuperAdmin = lowerRole === "super admin";
  const isAdmin = isSuperAdmin || lowerRole.includes("admin");
  return { roleName: cleanRole, isAdmin, isSuperAdmin, roleId: "" };
}

function normalizeValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    str === "" ||
    str === "—" ||
    str === "-" ||
    str.toLowerCase() === "null" ||
    str.toLowerCase() === "undefined"
  ) {
    return "";
  }
  const cleanedNumStr = str.replace(/,/g, "");
  const num = Number(cleanedNumStr);
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(cleanedNumStr)) {
    return String(Math.round(num * 10000) / 10000);
  }
  return str.toLowerCase();
}

function getRowValueCaseInsensitive(row: Record<string, unknown>, targetKey: string): unknown {
  if (row[targetKey] !== undefined) return row[targetKey];
  const cleanTarget = targetKey.trim().toLowerCase();
  const foundKey = Object.keys(row).find((k) => k.trim().toLowerCase() === cleanTarget);
  return foundKey ? row[foundKey] : undefined;
}

export function computeRowDiffs(
  existingRows: Record<string, unknown>[],
  newRows: Record<string, unknown>[],
  uploaderName: string
): Record<string, unknown>[] {
  if (!Array.isArray(existingRows) || existingRows.length === 0) {
    return newRows;
  }

  const sampleNew = newRows[0] || {};
  const sampleOld = existingRows[0] || {};

  // Dynamically extract data keys (excluding internal metadata starting with '_')
  const newKeys = Object.keys(sampleNew).filter((k) => !k.startsWith("_"));
  const oldKeys = Object.keys(sampleOld).filter((k) => !k.startsWith("_"));
  const commonKeys = newKeys.filter((k) =>
    oldKeys.some((ok) => ok.trim().toLowerCase() === k.trim().toLowerCase())
  );

  // 1. Dynamically find a unique matching key column if one exists in the dataset
  let dynamicMatchKey: string | null = null;

  for (const key of commonKeys) {
    const values = newRows
      .map((r) => r[key])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "");

    const isUnique =
      values.length === newRows.length &&
      new Set(values.map((v) => String(v).trim().toLowerCase())).size === values.length;

    if (isUnique) {
      dynamicMatchKey = key;
      break;
    }
  }

  // 2. If no 100% unique key was found, dynamically look for any common column matching identifier patterns
  if (!dynamicMatchKey) {
    const idPattern = /(id|no|num|code|ref|sr|bill|voucher|serial|index)/i;
    dynamicMatchKey = commonKeys.find((k) => idPattern.test(k)) || null;
  }

  // Build index map from existing DB rows if a dynamic match key was found
  const existingMap = new Map<string, Record<string, unknown>>();
  if (dynamicMatchKey) {
    existingRows.forEach((row, idx) => {
      const val = getRowValueCaseInsensitive(row, dynamicMatchKey!);
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        existingMap.set(String(val).trim().toLowerCase(), row);
      } else {
        existingMap.set(`__idx_${idx}`, row);
      }
    });
  }

  // Cross-verify incoming newRows against stored DB existingRows
  return newRows.map((newRow, idx) => {
    let oldRow: Record<string, unknown> | undefined;

    if (dynamicMatchKey) {
      const val = newRow[dynamicMatchKey];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        oldRow = existingMap.get(String(val).trim().toLowerCase());
      }
    }

    // Fallback to row index if oldRow is not found by key
    if (!oldRow) {
      oldRow = existingRows[idx];
    }

    const mergedRow: Record<string, unknown> = { ...newRow };
    delete mergedRow._isModified;
    delete mergedRow._diff;
    delete mergedRow._modifiedAt;
    delete mergedRow._modifiedBy;
    delete mergedRow._isNewEntry;

    if (!oldRow) {
      mergedRow._isNewEntry = true;
      return mergedRow;
    }

    const fieldDiffs: Record<string, { old: unknown; new: unknown }> = {};
    const existingPrevDiffs = (oldRow._diff as Record<string, { old: unknown; new: unknown }>) || {};

    // Compare all fields in newRow against oldRow from DB
    Object.keys(newRow).forEach((key) => {
      if (key.startsWith("_")) return;

      const newVal = newRow[key];
      const currentOldVal = getRowValueCaseInsensitive(oldRow!, key);

      const prevDiff = existingPrevDiffs[key];
      const originalOldVal = prevDiff?.old !== undefined ? prevDiff.old : currentOldVal;

      const normNew = normalizeValue(newVal);
      const normCurrentOld = normalizeValue(currentOldVal);
      const normOriginalOld = normalizeValue(originalOldVal);

      // Compare normalized values. Only mark field diff if new value is actually different from current/original
      if (normNew !== normCurrentOld || (prevDiff && normNew !== normOriginalOld)) {
        if (normNew !== normOriginalOld) {
          fieldDiffs[key] = {
            old: originalOldVal !== undefined && originalOldVal !== null && String(originalOldVal).trim() !== "" ? originalOldVal : "—",
            new: newVal !== undefined && newVal !== null && String(newVal).trim() !== "" ? newVal : "—",
          };
        }
      }
    });

    if (Object.keys(fieldDiffs).length > 0) {
      mergedRow._isModified = true;
      mergedRow._diff = fieldDiffs;
      mergedRow._modifiedAt = new Date().toISOString();
      mergedRow._modifiedBy = uploaderName;
    }

    return mergedRow;
  });
}

function buildIdFilter(id: string | string[]) {
  const idStr = Array.isArray(id) ? id[0] : id;
  const isObjectId = /^[a-f\d]{24}$/i.test(idStr);
  return isObjectId
    ? { $or: [{ _id: idStr }, { reportId: idStr }] }
    : { reportId: idStr };
}

function buildCreatedAtFilter(startDate?: unknown, endDate?: unknown) {
  const createdAtFilter: Record<string, Date> = {};

  if (startDate && typeof startDate === "string" && startDate.trim()) {
    const s = startDate.trim();
    const startUtc = new Date(s.includes("T") ? s : `${s}T00:00:00.000Z`).getTime();
    const startLocal = new Date(s.includes("T") ? s : `${s}T00:00:00.000`).getTime();
    const minStart = isNaN(startLocal) ? startUtc : Math.min(startUtc, startLocal);
    createdAtFilter.$gte = new Date(minStart);
  }

  if (endDate && typeof endDate === "string" && endDate.trim()) {
    const e = endDate.trim();
    const endUtc = new Date(e.includes("T") ? e : `${e}T23:59:59.999Z`).getTime();
    const endLocal = new Date(e.includes("T") ? e : `${e}T23:59:59.999`).getTime();
    const maxEnd = isNaN(endLocal) ? endUtc : Math.max(endUtc, endLocal);
    createdAtFilter.$lte = new Date(maxEnd);
  }

  return Object.keys(createdAtFilter).length > 0 ? createdAtFilter : null;
}

// GET /api/reports — List reports with dynamic database filtering & role data isolation
reportsRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const { startDate, endDate, type, owner, status, search } = req.query;
    const queryFilter: Record<string, unknown> = {};

    if (type && typeof type === "string" && type.trim() && type !== "All") {
      const cleanType = type.trim();
      const escapedType = escapeRegex(cleanType);
      queryFilter.$or = [
        { type: { $regex: escapedType, $options: "i" } },
        { name: { $regex: escapedType, $options: "i" } },
      ];
    }

    if (owner && typeof owner === "string" && owner.trim() && owner !== "All") {
      const escapedOwner = escapeRegex(owner.trim());
      queryFilter.owner = { $regex: escapedOwner, $options: "i" };
    }

    if (
      status &&
      typeof status === "string" &&
      status.trim() &&
      status !== "All"
    ) {
      queryFilter.status = status.trim();
    }

    if (search && typeof search === "string" && search.trim()) {
      const q = escapeRegex(search.trim());
      const searchOr = [
        { name: { $regex: q, $options: "i" } },
        { type: { $regex: q, $options: "i" } },
        { owner: { $regex: q, $options: "i" } },
      ];
      if (queryFilter.$or) {
        queryFilter.$and = [
          { $or: queryFilter.$or as unknown[] },
          { $or: searchOr },
        ];
        delete queryFilter.$or;
      } else {
        queryFilter.$or = searchOr;
      }
    }

    if (startDate || endDate) {
      const createdAtFilter = buildCreatedAtFilter(startDate, endDate);
      if (createdAtFilter) {
        queryFilter.createdAt = createdAtFilter;
      }
    }

    const roleScope = await buildRoleScopeFilter(req);
    const finalQuery = Object.keys(roleScope).length > 0
      ? { $and: [queryFilter, roleScope] }
      : queryFilter;

    const reports = await ReportModel.find(finalQuery).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: reports,
      message: "Reports retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/reports/filters/options — Dynamic filter choices from DB (supports date range & role scope)
reportsRouter.get("/filters/options", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const { startDate, endDate } = req.query;
    const queryFilter: Record<string, unknown> = {};
    const hasDateFilter = Boolean(startDate || endDate);

    if (hasDateFilter) {
      const createdAtFilter = buildCreatedAtFilter(startDate, endDate);
      if (createdAtFilter) {
        queryFilter.createdAt = createdAtFilter;
      }
    }

    const roleScope = await buildRoleScopeFilter(req);
    const finalQuery = Object.keys(roleScope).length > 0
      ? { $and: [queryFilter, roleScope] }
      : queryFilter;

    const userRole = req.user?.role || "";
    const isSuperAdmin = userRole === "Super Admin";
    const isAdmin = isSuperAdmin || userRole === "Administrator" || userRole === "Admin" || userRole.toLowerCase().includes("admin");

    const [types, names, catalogTypes, owners] = await Promise.all([
      ReportModel.distinct("type", finalQuery),
      ReportModel.distinct("name", finalQuery),
      isAdmin && !hasDateFilter ? ReportTypeModel.distinct("name") : Promise.resolve([]),
      ReportModel.distinct("owner", finalQuery),
    ]);

    const statuses = ["Pending", "Approved", "Review", "Inactive"];

    const combinedTypes = Array.from(
      new Set(
        [...types, ...names, ...catalogTypes]
          .filter(
            (t): t is string => typeof t === "string" && Boolean(t.trim()),
          )
          .map((t) => t.trim()),
      ),
    ).sort();

    const cleanOwners = Array.from(
      new Set(
        owners
          .filter(
            (o): o is string => typeof o === "string" && Boolean(o.trim()),
          )
          .map((o) => o.trim()),
      ),
    ).sort();

    res.json({
      success: true,
      data: {
        types: combinedTypes,
        owners: cleanOwners,
        statuses,
      },
      message: "Report filter options retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/reports/:id — Single report
reportsRouter.get("/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Please try again shortly.",
      });
    }

    const roleScope = await buildRoleScopeFilter(req);
    const idFilter = buildIdFilter(id);
    const finalQuery = Object.keys(roleScope).length > 0
      ? { $and: [idFilter, roleScope] }
      : idFilter;

    let report = await ReportModel.findOne(finalQuery);
    if (!report) {
      report = await ReportModel.findOne(idFilter);
    }

    if (!report) {
      return res
        .status(404)
        .json({ success: false, error: "Requested report was not found." });
    }

    res.json({
      success: true,
      data: report,
      message: "Report details retrieved successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export function getExactDayRange(dateInput?: string | Date | null): { dayStart: Date; dayEnd: Date } {
  const d = dateInput ? new Date(dateInput) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  let year: number, month: number, day: number;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateInput.trim())) {
    const parts = dateInput.trim().split("T")[0].split("-").map(Number);
    year = parts[0];
    month = parts[1] - 1;
    day = parts[2];
  } else {
    year = validDate.getFullYear();
    month = validDate.getMonth();
    day = validDate.getDate();
  }

  const localStart = new Date(year, month, day, 0, 0, 0, 0);
  const localEnd = new Date(year, month, day, 23, 59, 59, 999);
  const utcStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const utcEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  const minTime = Math.min(localStart.getTime(), utcStart.getTime());
  const maxTime = Math.max(localEnd.getTime(), utcEnd.getTime());

  return {
    dayStart: new Date(minTime),
    dayEnd: new Date(maxTime),
  };
}

// POST /api/reports/check — Pre-upload check endpoint to inspect existing reports & entry changes
reportsRouter.post("/check", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { name, data, headers, headerStructure, createdAt, ownerRole } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Report name is required for pre-check.",
      });
    }

    const cleanName = name.trim();
    let customCreatedAt: Date = new Date();
    if (createdAt && typeof createdAt === "string" && createdAt.trim()) {
      const parsed = new Date(createdAt.trim());
      if (!isNaN(parsed.getTime())) {
        customCreatedAt = parsed;
      }
    }

    const enriched = enrichMeltingReportPurity(
      cleanName,
      headers || [],
      data || [],
      headerStructure,
    );

    const contentHash = computeContentHash(enriched.data || []);
    const rawUploaderRole = req.user?.role || ownerRole?.trim() || "User";
    const uploaderRoleInfo = await getRoleInfo(rawUploaderRole);

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot run pre-check.",
      });
    }

    // Determine target date window (Start of day to End of day) for duplicate checking
    const { dayStart, dayEnd } = getExactDayRange(createdAt || customCreatedAt);
    const dayFilter = { createdAt: { $gte: dayStart, $lte: dayEnd } };
    const existingReportsOnDay = await ReportModel.find(dayFilter);

    const matchingSameNameReport = existingReportsOnDay.find(
      (r) => r.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );

    const matchingSameContentReport = contentHash
      ? existingReportsOnDay.find((r) => r.contentHash === contentHash)
      : undefined;

    // 1. Super Admin & Cross-Role protection check
    const protectedTarget = matchingSameNameReport || matchingSameContentReport;
    if (protectedTarget) {
      const rawTargetRole = protectedTarget.ownerRole?.trim() || "User";
      const targetOwnerName = protectedTarget.owner?.trim() || "Unknown";
      const targetRoleInfo = await getRoleInfo(rawTargetRole);

      // Case A: Super Admin protection check
      if (targetRoleInfo.isSuperAdmin && !uploaderRoleInfo.isAdmin) {
        const uploaderMsg = `Upload Blocked: Report '${protectedTarget.name}' was uploaded today by Super Admin '${targetOwnerName}' (${targetRoleInfo.roleName}). Standard users cannot overwrite or duplicate Super Admin reports.`;
        return res.json({
          success: true,
          exists: true,
          canUpload: false,
          isSuperAdminProtected: true,
          isRoleProtected: true,
          existingReport: {
            reportId: protectedTarget.reportId,
            name: protectedTarget.name,
            owner: protectedTarget.owner,
            ownerRole: protectedTarget.ownerRole,
            rowsCount: protectedTarget.rowsCount,
            createdAt: protectedTarget.createdAt,
          },
          error: uploaderMsg,
          message: uploaderMsg,
        });
      }

      // Case B: Cross-Role protection check (Only original uploader role or Admins can overwrite)
      if (!uploaderRoleInfo.isAdmin && targetRoleInfo.roleName.toLowerCase() !== uploaderRoleInfo.roleName.toLowerCase()) {
        const uploaderMsg = `Upload Blocked: Report '${protectedTarget.name}' was uploaded today by user '${targetOwnerName}' (${targetRoleInfo.roleName}). Users belonging to a different role ('${uploaderRoleInfo.roleName}') cannot overwrite or duplicate reports uploaded by other roles.`;
        return res.json({
          success: true,
          exists: true,
          canUpload: false,
          isSuperAdminProtected: false,
          isRoleProtected: true,
          existingReport: {
            reportId: protectedTarget.reportId,
            name: protectedTarget.name,
            owner: protectedTarget.owner,
            ownerRole: protectedTarget.ownerRole,
            rowsCount: protectedTarget.rowsCount,
            createdAt: protectedTarget.createdAt,
          },
          error: uploaderMsg,
          message: uploaderMsg,
        });
      }
    }

    // 2. Report with matching name OR matching content exists for today
    const matchingTargetReport = matchingSameNameReport || matchingSameContentReport;

    if (matchingTargetReport) {
      const isExactDuplicate = Boolean(contentHash) && matchingTargetReport.contentHash === contentHash;
      const dupMsg = isExactDuplicate
        ? `Upload Blocked: Report '${matchingTargetReport.name}' has already been uploaded today by user '${matchingTargetReport.owner}' (${matchingTargetReport.ownerRole || "User"}) with identical entries.`
        : `Upload Notice: Report '${matchingTargetReport.name}' already exists for today (uploaded by '${matchingTargetReport.owner}'), but entry changes were detected.`;

      return res.json({
        success: true,
        exists: true,
        canUpload: false,
        isExactDuplicate,
        hasEntryChanges: !isExactDuplicate,
        contentMatch: Boolean(matchingSameContentReport),
        existingName: matchingTargetReport.name,
        existingReport: {
          reportId: matchingTargetReport.reportId,
          name: matchingTargetReport.name,
          owner: matchingTargetReport.owner,
          ownerRole: matchingTargetReport.ownerRole,
          rowsCount: matchingTargetReport.rowsCount,
          createdAt: matchingTargetReport.createdAt,
        },
        message: dupMsg,
        error: dupMsg,
      });
    }

    // 4. Report does NOT exist for today
    return res.json({
      success: true,
      exists: false,
      canUpload: true,
      message: `No existing report found for '${cleanName}' today. Safe to upload.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/reports — Create or update report with duplicate detection and role hierarchy checks
reportsRouter.post("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const {
      name,
      type,
      source,
      owner,
      ownerRole,
      data,
      headers,
      headerStructure,
      createdAt,
      overwrite,
      forceDuplicate,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Report name is required.",
      });
    }

    const cleanName = name.trim();

    let customCreatedAt: Date = new Date();
    if (createdAt && typeof createdAt === "string" && createdAt.trim()) {
      const parsed = new Date(createdAt.trim());
      if (!isNaN(parsed.getTime())) {
        customCreatedAt = parsed;
      }
    }

    // Enrich melting report data with Purity field structure before saving to DB
    const enriched = enrichMeltingReportPurity(
      cleanName,
      headers || [],
      data || [],
      headerStructure,
    );

    const contentHash = computeContentHash(enriched.data || []);
    const rawUploaderRole = req.user?.role || ownerRole?.trim() || "User";
    const uploaderName = owner?.trim() || req.user?.name || req.user?.email || "Unknown";
    const uploaderRoleInfo = await getRoleInfo(rawUploaderRole);

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot save report.",
      });
    }

    // Determine target date window (Start of day to End of day) for duplicate checking
    const { dayStart, dayEnd } = getExactDayRange(createdAt || customCreatedAt);
    const dayFilter = { createdAt: { $gte: dayStart, $lte: dayEnd } };
    const existingReportsOnDay = await ReportModel.find(dayFilter);

    const matchingSameNameReport = existingReportsOnDay.find(
      (r) => r.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );

    const matchingSameContentReport = contentHash
      ? existingReportsOnDay.find((r) => r.contentHash === contentHash)
      : undefined;

    // 1. Scenario 4: Super Admin & Cross-Role protection check
    const protectedTarget = matchingSameNameReport || matchingSameContentReport;
    if (protectedTarget) {
      const rawTargetRole = protectedTarget.ownerRole?.trim() || "User";
      const targetOwnerName = protectedTarget.owner?.trim() || "Unknown";
      const targetRoleInfo = await getRoleInfo(rawTargetRole);

      if (targetRoleInfo.isSuperAdmin && !uploaderRoleInfo.isAdmin) {
        return res.status(403).json({
          success: false,
          error: `This report for today was uploaded/managed by Super Admin '${targetOwnerName}'. Standard users cannot overwrite or duplicate Super Admin reports.`,
        });
      }

      if (!uploaderRoleInfo.isAdmin && targetRoleInfo.roleName.toLowerCase() !== uploaderRoleInfo.roleName.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: `This report for today was uploaded by user '${targetOwnerName}' (${targetRoleInfo.roleName}). Users belonging to role '${uploaderRoleInfo.roleName}' cannot overwrite or duplicate reports uploaded by other roles.`,
        });
      }
    }

    const roleId = uploaderRoleInfo.roleId;

    // 2. Report with matching name OR matching content exists on the same day
    const targetReportToOverwrite = matchingSameNameReport || matchingSameContentReport;

    if (targetReportToOverwrite && !forceDuplicate) {
      // If explicit overwrite is requested (or when user confirms overwriting existing report)
      if (overwrite) {
        const existingData = (targetReportToOverwrite.data as Record<string, unknown>[]) || [];
        const processedRowsWithDiffs = computeRowDiffs(existingData, enriched.data || [], uploaderName);

        targetReportToOverwrite.data = processedRowsWithDiffs;
        targetReportToOverwrite.headers = enriched.headers || [];
        targetReportToOverwrite.headerStructure = enriched.headerStructure as unknown as Record<
          string,
          unknown
        >;
        targetReportToOverwrite.rowsCount = Array.isArray(processedRowsWithDiffs)
          ? processedRowsWithDiffs.length
          : 0;
        targetReportToOverwrite.contentHash = contentHash;
        targetReportToOverwrite.owner = uploaderName;
        targetReportToOverwrite.ownerRole = uploaderRoleInfo.roleName;
        if (roleId) targetReportToOverwrite.roleId = roleId;
        targetReportToOverwrite.status = "Pending";
        await targetReportToOverwrite.save();

        await syncReportTypes();

        const msg = `Report '${targetReportToOverwrite.name}' updated successfully with uploaded entries for today.`;

        await logActivity(req, {
          module: "Reports",
          section: `Report ${targetReportToOverwrite.name}`,
          action: "Update",
          details: `${msg} (${targetReportToOverwrite.rowsCount} records).`,
        });

        return res.status(200).json({
          success: true,
          data: targetReportToOverwrite,
          isUpdated: true,
          message: msg,
        });
      }

      // STRICT BLOCK FOR DUPLICATES: Reject upload attempt with 400 Bad Request
      return res.status(400).json({
        success: false,
        isDuplicate: true,
        canOverwrite: true,
        existingReport: targetReportToOverwrite,
        error: `Upload Blocked: Report '${targetReportToOverwrite.name}' has already been uploaded today by ${targetReportToOverwrite.owner}. Duplicate report upload on the same day is not allowed!`,
      });
    }

    // 4. Create new report document
    let newReportData = enriched.data || [];
    try {
      const priorReport = await ReportModel.findOne({
        $or: [
          { name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" } },
          { type: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" } },
        ],
        createdAt: { $lt: dayStart },
      }).sort({ createdAt: -1 });

      if (priorReport && Array.isArray(priorReport.data) && priorReport.data.length > 0) {
        newReportData = computeRowDiffs(
          priorReport.data as Record<string, unknown>[],
          newReportData,
          uploaderName
        );
      }
    } catch (err) {
      console.warn("Failed to compare new report against prior report:", err);
    }

    const reportId = `REP-${Date.now().toString(36).toUpperCase()}`;
    const newReport = await ReportModel.create({
      reportId,
      name: cleanName,
      type: cleanName,
      source: source || "Spreadsheet Upload",
      owner: uploaderName,
      ownerRole: uploaderRoleInfo.roleName,
      roleId,
      contentHash,
      status: "Pending",
      rowsCount: Array.isArray(newReportData) ? newReportData.length : 0,
      data: newReportData,
      headers: enriched.headers || [],
      headerStructure: enriched.headerStructure as unknown as Record<
        string,
        unknown
      >,
      createdAt: customCreatedAt,
    });

    await syncReportTypes();

    const createdName = newReport?.name || cleanName;
    const createdRowsCount = newReport?.rowsCount || 0;

    await logActivity(req, {
      module: "Reports",
      section: `Report ${createdName}`,
      action: "Add",
      details: `Uploaded new report "${createdName}" with ${createdRowsCount} records.`,
    });

    res.status(201).json({
      success: true,
      data: newReport,
      message: "Report uploaded and stored successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PUT /api/reports/:id — Edit report
reportsRouter.put("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, type, owner } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Report name is required." });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res
        .status(503)
        .json({ success: false, error: "Database unavailable." });
    }

    const cleanName = name.trim();
    const updated = await ReportModel.findOneAndUpdate(
      buildIdFilter(id),
      { name: cleanName, type: cleanName, owner: owner?.trim() || "Unknown" },
      { new: true },
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, error: "Report not found." });
    }

    await syncReportTypes();

    await logActivity(req, {
      module: "Reports",
      section: `Report ${updated.name}`,
      action: "Update",
      details: `Updated report metadata for "${updated.name}".`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Report '${updated.name}' updated successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /api/reports/:id/status — Toggle status
reportsRouter.patch("/:id/status", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ["Pending", "Approved", "Review"];

    if (status && !allowed.includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          error: `Status must be one of: ${allowed.join(", ")}`,
        });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res
        .status(503)
        .json({ success: false, error: "Database unavailable." });
    }

    const updated = await ReportModel.findOneAndUpdate(
      buildIdFilter(id),
      { status },
      { new: true },
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, error: "Report not found." });
    }

    await logActivity(req, {
      module: "Reports",
      section: `Report ${updated.name}`,
      action: "Update",
      details: `Toggled report status to "${status}" for "${updated.name}".`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Report status updated to '${status}'.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /api/reports/:id — Delete report
reportsRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.stateCode !== 1) {
      return res
        .status(503)
        .json({ success: false, error: "Database unavailable." });
    }

    const deleted = await ReportModel.findOneAndDelete(buildIdFilter(id));

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Report not found." });
    }

    if (deleted.name || deleted.type) {
      const targetName = (deleted.name || deleted.type || "").trim();
      const remainingCount = await ReportModel.countDocuments({
        $or: [
          { name: { $regex: `^${escapeRegex(targetName)}$`, $options: "i" } },
          { type: { $regex: `^${escapeRegex(targetName)}$`, $options: "i" } },
        ],
      });
      if (remainingCount === 0) {
        await ReportTypeModel.deleteMany({
          name: { $regex: `^${escapeRegex(targetName)}$`, $options: "i" },
        });
      }
    }

    await syncReportTypes();

    await logActivity(req, {
      module: "Reports",
      section: `Report ${deleted.name}`,
      action: "Delete",
      details: `Deleted report "${deleted.name}".`,
    });

    res.json({
      success: true,
      message: `Report '${deleted.name}' deleted successfully.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/reports/:id/approvals — Approvals update (replaces current set, dynamic)
reportsRouter.post("/:id/approvals", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    // selectedIndexes: number[]  — which row indexes are currently approved
    // selectedEntries: { rowIndex: number; rowId?: string }[]  — optional richer per-row metadata
    // approvedBy: string
    const { selectedIndexes, selectedEntries, approvedBy } = req.body;

    if (!Array.isArray(selectedIndexes)) {
      return res.status(400).json({
        success: false,
        error: "selectedIndexes must be an array.",
      });
    }

    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) {
      return res.status(503).json({
        success: false,
        error: "Database is currently unavailable. Cannot save approvals.",
      });
    }

    const report = await ReportModel.findOne(buildIdFilter(id));

    if (!report) {
      return res
        .status(404)
        .json({ success: false, error: "Report not found for approval." });
    }

    // Build a map from rowIndex → rowId for quick lookup
    const entryMap = new Map<number, string | undefined>();
    if (Array.isArray(selectedEntries)) {
      selectedEntries.forEach((e: { rowIndex: number; rowId?: string }) => {
        if (typeof e.rowIndex === "number") {
          entryMap.set(e.rowIndex, e.rowId);
        }
      });
    }

    const approver = approvedBy?.trim() || "Unknown";
    const now = new Date();

    // Keep existing approvals for indexes that are still selected (preserve original approvedAt)
    // and add new approvals for newly selected indexes
    const existingMap = new Map<number, { rowId?: string; approvedBy: string; approvedAt: Date }>();
    (report.approvals || []).forEach((a) => {
      if (typeof a.rowIndex === "number") {
        existingMap.set(a.rowIndex, {
          rowId: a.rowId,
          approvedBy: a.approvedBy,
          approvedAt: a.approvedAt,
        });
      }
    });

    // Replace approvals entirely with the current selected set
    const newApprovals = selectedIndexes.map((idx: number) => {
      const existing = existingMap.get(idx);
      return {
        rowIndex: idx,
        rowId: entryMap.get(idx) ?? existing?.rowId,
        approvedBy: existing?.approvedBy ?? approver,
        approvedAt: existing?.approvedAt ?? now,
      };
    });

    report.approvals = newApprovals;
    // Status: Approved if any rows selected, Pending if all deselected
    report.status = newApprovals.length > 0 ? "Approved" : "Pending";
    await report.save();

    await logActivity(req, {
      module: "Approvals",
      section: `Report ${report.name}`,
      action: "Update",
      details: `Saved ${newApprovals.length} approved row(s) in report "${report.name}" by ${approver}.`,
    });

    res.json({
      success: true,
      data: report,
      message:
        newApprovals.length > 0
          ? `${newApprovals.length} row(s) approved and saved successfully.`
          : "All approvals cleared. Report marked as Pending.",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});


function enrichMeltingReportPurity(
  name: string,
  rawHeaders: string[] = [],
  rawData: Record<string, unknown>[] = [],
  headerStructure?: Record<string, unknown>,
): {
  data: Record<string, unknown>[];
  headers: string[];
  headerStructure?: Record<string, unknown>;
} {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { data: rawData, headers: rawHeaders, headerStructure };
  }

  const isMelting = name.toLowerCase().includes("melting");
  if (!isMelting) {
    return { data: rawData, headers: rawHeaders, headerStructure };
  }

  const sampleRow = rawData[0] || {};
  const allKeys = Array.from(
    new Set([...rawHeaders, ...Object.keys(sampleRow)]),
  );

  const parseNum = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    const str = String(value).trim();
    if (
      str === "" ||
      str === "—" ||
      str === "-" ||
      str.toLowerCase() === "null" ||
      str.toLowerCase() === "undefined"
    ) {
      return 0;
    }
    const cleaned = str.replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const findColumn = (
    exactNames: string[],
    fallbackRegex: RegExp,
  ): string | undefined => {
    for (const n of exactNames) {
      const found = allKeys.find(
        (c) => c.trim().toLowerCase() === n.toLowerCase(),
      );
      if (found) return found;
    }
    return allKeys.find((c) => fallbackRegex.test(c.trim()));
  };

  const pureWtCols = allKeys.filter((c) =>
    /pure\s*(wt|weight)/i.test(c.trim()),
  );
  let outPureWeightCol =
    findColumn(
      ["Pure Wt (2)", "Pure Weight (2)"],
      /^pure\s*(wt|weight)\s*\(2\)$/i,
    ) || allKeys.find((c) => /out.*pure|pure.*\(2\)|pure.*out/i.test(c.trim()));

  if (!outPureWeightCol && pureWtCols.length > 1) {
    outPureWeightCol = pureWtCols[pureWtCols.length - 1];
  } else if (!outPureWeightCol && pureWtCols.length === 1) {
    outPureWeightCol = pureWtCols[0];
  }

  const weightCols = allKeys.filter(
    (c) => /^weight$|in.*wt/i.test(c.trim()) && !/pure/i.test(c),
  );
  let inWeightCol =
    findColumn(["Weight"], /^weight$/i) ||
    allKeys.find((c) => /in.*wt/i.test(c.trim())) ||
    weightCols[0];

  const hasPurityCol = allKeys.some((c) => /purity/i.test(c.trim()));

  // Dynamically check if the report features weight/purity calculations; otherwise preserve raw data untouched
  const hasWeightPurityCols = (inWeightCol && outPureWeightCol) || hasPurityCol;

  if (!hasWeightPurityCols) {
    return { data: rawData, headers: rawHeaders, headerStructure };
  }
  const transNoCol = allKeys.find((c) => /^transno$/i.test(c.trim()));
  const itemCol = allKeys.find((c) =>
    /^(item|description|product|particular)$/i.test(c.trim()),
  );

  // TransNo grouping totals calculation
  const transNoTotals = new Map<
    string,
    { totalIn: number; totalOutPure: number }
  >();
  if (transNoCol && inWeightCol && outPureWeightCol) {
    let currentTransNo = "";
    rawData.forEach((row) => {
      const rawTrans = String(row[transNoCol] ?? "").trim();
      if (rawTrans) {
        currentTransNo = rawTrans;
      }
      if (!currentTransNo) return;

      if (!transNoTotals.has(currentTransNo)) {
        transNoTotals.set(currentTransNo, { totalIn: 0, totalOutPure: 0 });
      }
      const totals = transNoTotals.get(currentTransNo)!;

      const inW = parseNum(row[inWeightCol]);
      if (inW > 0) totals.totalIn += inW;

      const itemName = itemCol
        ? String(row[itemCol] ?? "")
            .trim()
            .toUpperCase()
        : "";
      if (!itemName.includes("ALLOY")) {
        const outP = parseNum(row[outPureWeightCol]);
        if (outP > 0) totals.totalOutPure += outP;
      }
    });
  }

  let currentTransNo = "";
  const enrichedData = rawData.map((row) => {
    const copy = { ...row };
    const rawTrans = transNoCol ? String(row[transNoCol] ?? "").trim() : "";
    if (rawTrans) {
      currentTransNo = rawTrans;
    }
    const transNo = currentTransNo;
    let purityStr = "—";

    if (transNo && transNoTotals.has(transNo)) {
      const totals = transNoTotals.get(transNo)!;
      if (totals.totalIn > 0) {
        const purity = (totals.totalOutPure / totals.totalIn) * 100;
        purityStr = `${purity.toFixed(2)}%`;
      }
    } else if (inWeightCol && outPureWeightCol) {
      const inW = parseNum(row[inWeightCol]);
      const itemName = itemCol
        ? String(row[itemCol] ?? "")
            .trim()
            .toUpperCase()
        : "";
      const outP = itemName.includes("ALLOY")
        ? 0
        : parseNum(row[outPureWeightCol]);
      if (inW > 0) {
        const purity = (outP / inW) * 100;
        purityStr = `${purity.toFixed(2)}%`;
      }
    }

    const currentPurity = String(copy["Purity"] || copy["purity"] || "").trim();
    if (
      !currentPurity ||
      currentPurity === "0.00%" ||
      currentPurity === "0%" ||
      currentPurity === "0"
    ) {
      copy["Purity"] = purityStr;
    }
    return copy;
  });

  const updatedHeaders = rawHeaders.some((h) => /purity/i.test(h))
    ? rawHeaders
    : [...rawHeaders.filter((h) => !/purity/i.test(h)), "Purity"];

  let updatedHeaderStructure = headerStructure;
  if (headerStructure) {
    const subHeaders = Array.isArray(headerStructure.subHeaders)
      ? (headerStructure.subHeaders as string[])
      : [];
    const hasPuritySub = subHeaders.some((s) => /purity/i.test(s));
    const newSub = hasPuritySub
      ? subHeaders
      : [...subHeaders.filter((s) => !/purity/i.test(s)), "Purity"];

    updatedHeaderStructure = {
      ...headerStructure,
      subHeaders: newSub,
    };
  }

  return {
    data: enrichedData,
    headers: updatedHeaders,
    headerStructure: updatedHeaderStructure,
  };
}
