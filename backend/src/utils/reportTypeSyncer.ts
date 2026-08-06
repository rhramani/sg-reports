import { ReportModel } from "../models/Report";
import { ReportTypeModel } from "../models/ReportType";
import { getDBStatus } from "../db";

export async function syncReportTypes(): Promise<void> {
  try {
    const dbStatus = getDBStatus();
    if (dbStatus.stateCode !== 1) return;

    // Aggregate active counts per report name/type from Report collection
    const reportTypeCounts: Array<{ _id: string; count: number }> = await ReportModel.aggregate([
      {
        $group: {
          _id: "$name",
          count: { $sum: 1 },
        },
      },
    ]);

    const activeTypeNames = new Set<string>();
    const today = new Date().toISOString().split("T")[0];

    for (const item of reportTypeCounts) {
      if (!item._id || !item._id.trim()) continue;
      const cleanName = item._id.trim();
      activeTypeNames.add(cleanName);

      const formattedCode = cleanName.toUpperCase().replace(/[^A-Z0-9]/g, "_");

      const existing = await ReportTypeModel.findOne({ name: cleanName });
      if (existing) {
        existing.reports = item.count;
        existing.lastUpdated = today;
        await existing.save();
      } else {
        await ReportTypeModel.create({
          name: cleanName,
          code: formattedCode,
          reports: item.count,
          lastUpdated: today,
          status: "Active",
        });
      }
    }

    // For any ReportType entry that no longer has active reports, set its report count to 0
    await ReportTypeModel.updateMany(
      { name: { $nin: Array.from(activeTypeNames) } },
      { $set: { reports: 0, lastUpdated: today } }
    );
  } catch (error) {
    console.error("Error synchronizing ReportTypes:", error);
  }
}
