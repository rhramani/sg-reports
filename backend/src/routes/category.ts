import { Router, Request, Response } from "express";
import { CategoryModel } from "../models/Category";
import { JewelleryTransactionReportModel, JewelleryTransactionItemModel } from "../models/JewelleryTransaction";
import { AuditLogModel } from "../models/AuditLog";

export const categoryRouter = Router();

// Helper to find category and base metal keys
function findCategoryKey(headers: string[], sampleRow?: Record<string, any>): string | null {
  const directMatch = headers.find((h) => h.trim().toLowerCase() === "category");
  if (directMatch) return directMatch;
  const possibleKeys = [
    "category",
    "item_category",
    "itemcategory",
    "category_name",
    "categoryname",
    "product_category",
    "productcategory",
    "cat",
    "item_cat",
    "category name",
    "item category",
  ];
  for (const h of headers) {
    const norm = h.trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (possibleKeys.some((pk) => pk.replace(/[\s_-]+/g, "") === norm)) return h;
  }

  if (sampleRow && typeof sampleRow === "object") {
    for (const key of Object.keys(sampleRow)) {
      const norm = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
      if (possibleKeys.some((pk) => pk.replace(/[\s_-]+/g, "") === norm)) return key;
    }
  }

  return null;
}

function findBaseMetalKey(headers: string[], sampleRow?: Record<string, any>): string | null {
  const directMatch = headers.find(
    (h) =>
      h.trim().toLowerCase() === "basemetal" ||
      h.trim().toLowerCase() === "base metal" ||
      h.trim().toLowerCase() === "metal"
  );
  if (directMatch) return directMatch;
  const possible = ["basemetal", "base metal", "metal", "metaltype", "goldtype", "base_metal"];
  for (const h of headers) {
    const norm = h.trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (possible.some((p) => p.replace(/[\s_-]+/g, "") === norm)) return h;
  }

  if (sampleRow && typeof sampleRow === "object") {
    for (const key of Object.keys(sampleRow)) {
      const norm = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
      if (possible.some((pk) => pk.replace(/[\s_-]+/g, "") === norm)) return key;
    }
  }

  return null;
}

// GET all categories (dynamic from MongoDB)
categoryRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await CategoryModel.find().sort({ name: 1, baseMetal: 1 });

    // Extract dynamic base metals from both Category Master and latest uploaded transaction dataset
    const metalSet = new Set<string>();
    categories.forEach((c) => {
      if (c.baseMetal && c.baseMetal.trim()) metalSet.add(c.baseMetal.trim());
    });

    const report = await JewelleryTransactionReportModel.findOne().sort({ createdAt: -1 });
    if (report) {
      const itemDocs = await JewelleryTransactionItemModel.find({ reportId: report._id }, { data: 1, _id: 0 }).lean();
      const reportRows = itemDocs.map((i) => i.data);
      const metalKey = findBaseMetalKey(report.headers, reportRows[0]);
      if (metalKey) {
        reportRows.forEach((r) => {
          const val = r[metalKey];
          if (val !== undefined && val !== null) {
            const s = String(val).trim();
            if (s && s !== "-" && s !== "N/A" && s !== "null") metalSet.add(s);
          }
        });
      }
    }

    const baseMetals = Array.from(metalSet).sort();

    res.json({
      success: true,
      data: categories,
      baseMetals,
      total: categories.length,
    });
  } catch (error) {
    console.error("GET /api/categories error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
});

// POST sync / populate categories and base metals from uploaded Jewellery Transactions
categoryRouter.post("/sync-from-transactions", async (_req: Request, res: Response) => {
  try {
    const report = await JewelleryTransactionReportModel.findOne().sort({ createdAt: -1 });
    if (!report) {
      return res.status(400).json({ success: false, error: "No transaction dataset available to sync from." });
    }

    const itemDocs = await JewelleryTransactionItemModel.find({ reportId: report._id }, { data: 1, _id: 0 }).lean();
    const reportRows = itemDocs.map((i) => i.data);
    if (reportRows.length === 0) {
      return res.status(400).json({ success: false, error: "No transaction dataset available to sync from." });
    }

    const catKey = findCategoryKey(report.headers, reportRows[0]);
    const metalKey = findBaseMetalKey(report.headers, reportRows[0]);

    if (!catKey) {
      return res.status(400).json({ success: false, error: "Category column not found in transaction dataset." });
    }

    const pairsMap = new Map<string, { name: string; baseMetal: string }>();
    reportRows.forEach((row) => {
      const c = String(row[catKey] || "").trim();
      const m = metalKey ? String(row[metalKey] || "").trim() : "";
      if (c && c !== "-" && c !== "N/A") {
        const key = `${c.toLowerCase()}__${m.toLowerCase()}`;
        if (!pairsMap.has(key)) {
          pairsMap.set(key, { name: c, baseMetal: m });
        }
      }
    });

    let newCreated = 0;
    let existingCount = 0;

    for (const { name: catName, baseMetal: metalVal } of pairsMap.values()) {
      const existing = await CategoryModel.findOne({
        name: { $regex: new RegExp(`^${catName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        baseMetal: { $regex: new RegExp(`^${metalVal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      });

      if (!existing) {
        // Carry over costing if base category exists without metal
        const parentCat = await CategoryModel.findOne({
          name: { $regex: new RegExp(`^${catName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        });

        await CategoryModel.create({
          name: catName,
          baseMetal: metalVal,
          description: metalVal ? `Auto-extracted for ${catName} (${metalVal})` : `Auto-extracted from transaction sheet`,
          costing: parentCat ? parentCat.costing : 0,
        });
        newCreated++;
      } else {
        existingCount++;
      }
    }

    const allCats = await CategoryModel.find().sort({ name: 1, baseMetal: 1 });
    res.json({
      success: true,
      message: `Synchronized ${pairsMap.size} (Category + Base Metal) combinations. (${newCreated} new created, ${existingCount} already existed).`,
      newCreated,
      total: allCats.length,
      data: allCats,
    });
  } catch (error: any) {
    console.error("POST /api/categories/sync-from-transactions error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to sync categories" });
  }
});

// POST new category
categoryRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, baseMetal, description, costing } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Category name is required." });
    }

    const trimmedName = name.trim();
    const trimmedMetal = (baseMetal || "").trim();
    const parsedCosting = typeof costing === "number" ? costing : parseFloat(String(costing || "0")) || 0;

    const existing = await CategoryModel.findOne({
      name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      baseMetal: { $regex: new RegExp(`^${trimmedMetal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });

    if (existing) {
      const metalDisplay = trimmedMetal ? ` for metal '${trimmedMetal}'` : "";
      return res.status(400).json({
        success: false,
        error: `Category '${trimmedName}'${metalDisplay} already exists.`,
      });
    }

    const category = await CategoryModel.create({
      name: trimmedName,
      baseMetal: trimmedMetal,
      description: (description || "").trim(),
      costing: parsedCosting >= 0 ? parsedCosting : 0,
    });

    const user = (req as any).user;
    if (user) {
      AuditLogModel.create({
        sessionId: `cat-${Date.now()}`,
        userName: user.name || "Admin",
        userEmail: user.email || "admin@sgreport.com",
        userRole: user.role || "Super Admin",
        loginTime: new Date().toISOString(),
        status: "Completed",
        totalActions: 1,
        timeline: [
          {
            timestamp: new Date().toISOString(),
            module: "Master",
            section: "Category Master",
            action: "Add",
            details: `Added new category: ${category.name} [Metal: ${category.baseMetal || "All"}] (Costing: ₹${category.costing})`,
          },
        ],
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: category, message: "Category added successfully" });
  } catch (error: any) {
    console.error("POST /api/categories error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to add category" });
  }
});

// PUT update category
categoryRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, baseMetal, description, costing } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Category name is required." });
    }

    const trimmedName = name.trim();
    const trimmedMetal = (baseMetal || "").trim();
    const parsedCosting = typeof costing === "number" ? costing : parseFloat(String(costing || "0")) || 0;

    const existing = await CategoryModel.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      baseMetal: { $regex: new RegExp(`^${trimmedMetal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });

    if (existing) {
      const metalDisplay = trimmedMetal ? ` for metal '${trimmedMetal}'` : "";
      return res.status(400).json({
        success: false,
        error: `Category '${trimmedName}'${metalDisplay} already exists.`,
      });
    }

    const category = await CategoryModel.findByIdAndUpdate(
      id,
      {
        name: trimmedName,
        baseMetal: trimmedMetal,
        description: (description || "").trim(),
        costing: parsedCosting >= 0 ? parsedCosting : 0,
      },
      { returnDocument: "after" }
    );

    if (!category) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }

    const user = (req as any).user;
    if (user) {
      AuditLogModel.create({
        sessionId: `cat-${Date.now()}`,
        userName: user.name || "Admin",
        userEmail: user.email || "admin@sgreport.com",
        userRole: user.role || "Super Admin",
        loginTime: new Date().toISOString(),
        status: "Completed",
        totalActions: 1,
        timeline: [
          {
            timestamp: new Date().toISOString(),
            module: "Master",
            section: "Category Master",
            action: "Update",
            details: `Updated category: ${category.name} [Metal: ${category.baseMetal || "All"}] (Costing: ₹${category.costing})`,
          },
        ],
      }).catch(() => {});
    }

    res.json({ success: true, data: category, message: "Category updated successfully" });
  } catch (error: any) {
    console.error("PUT /api/categories/:id error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to update category" });
  }
});

// PATCH update single category costing
categoryRouter.patch("/:id/costing", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { costing } = req.body;

    const parsedCosting = typeof costing === "number" ? costing : parseFloat(String(costing || "0")) || 0;

    const category = await CategoryModel.findByIdAndUpdate(
      id,
      { costing: parsedCosting >= 0 ? parsedCosting : 0 },
      { returnDocument: "after" }
    );

    if (!category) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }

    res.json({ success: true, data: category, message: `Costing updated to ₹${category.costing}` });
  } catch (error: any) {
    console.error("PATCH /api/categories/:id/costing error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to update category costing" });
  }
});

// DELETE category
categoryRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await CategoryModel.findByIdAndDelete(id);

    if (!category) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }

    const user = (req as any).user;
    if (user) {
      AuditLogModel.create({
        sessionId: `cat-${Date.now()}`,
        userName: user.name || "Admin",
        userEmail: user.email || "admin@sgreport.com",
        userRole: user.role || "Super Admin",
        loginTime: new Date().toISOString(),
        status: "Completed",
        totalActions: 1,
        timeline: [
          {
            timestamp: new Date().toISOString(),
            module: "Master",
            section: "Category Master",
            action: "Delete",
            details: `Deleted category: ${category.name} [Metal: ${category.baseMetal || "All"}]`,
          },
        ],
      }).catch(() => {});
    }

    res.json({ success: true, message: `Category '${category.name}' deleted successfully.` });
  } catch (error: any) {
    console.error("DELETE /api/categories/:id error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to delete category" });
  }
});
