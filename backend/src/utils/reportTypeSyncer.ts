import { ReportModel } from "../models/Report";
import { ReportTypeModel } from "../models/ReportType";
import { getDBStatus } from "../db";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function syncReportTypes(): Promise<void> {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) return;

    // Aggregate active counts per report type/name from Report collection
    const reportTypeCounts: Array<{ _id: string; count: number }> = await ReportModel.aggregate([
      {
        $project: {
          reportTypeName: {
            $cond: [
              { $and: [{ $ne: ["$type", null] }, { $ne: ["$type", ""] }] },
              "$type",
              "$name",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$reportTypeName",
          count: { $sum: 1 },
        },
      },
    ]);

    const activeTypeNames: string[] = [];
    const today = new Date().toISOString().split("T")[0];

    for (const item of reportTypeCounts) {
      if (!item._id || typeof item._id !== "string" || !item._id.trim()) continue;
      const cleanName = item._id.trim();
      activeTypeNames.push(cleanName);

      let baseCode = cleanName.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      if (!baseCode) {
        baseCode = `TYPE_${Date.now()}`;
      }

      // Case-insensitive lookup for existing ReportType
      const existing = await ReportTypeModel.findOne({
        name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" },
      });

      if (existing) {
        existing.reports = item.count;
        existing.lastUpdated = today;
        await existing.save();
      } else {
        // Ensure code uniqueness before creating
        let formattedCode = baseCode;
        let counter = 1;
        while (await ReportTypeModel.findOne({ code: formattedCode })) {
          formattedCode = `${baseCode}_${counter}`;
          counter++;
        }

        await ReportTypeModel.create({
          name: cleanName,
          code: formattedCode,
          reports: item.count,
          lastUpdated: today,
          status: "Active",
        });
      }
    }

    // Delete any ReportType in the database that has no remaining active reports in ReportModel
    const activeRegexes = activeTypeNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, "i"));
    await ReportTypeModel.deleteMany({
      name: { $nin: activeRegexes },
    });
  } catch (error) {
    console.error("Error synchronizing ReportTypes:", error);
  }
}
