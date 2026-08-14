import { describe, it, expect } from "vitest";

function getExactDayRange(dateInput?: string | Date | null): { dayStart: Date; dayEnd: Date } {
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

function computeRowDiffs(
  existingRows: Record<string, unknown>[],
  newRows: Record<string, unknown>[],
  uploaderName: string
): Record<string, unknown>[] {
  if (!Array.isArray(existingRows) || existingRows.length === 0) {
    return newRows;
  }

  const merged = newRows.map((newRow, idx) => {
    const oldRow = existingRows[idx];
    const mergedRow: Record<string, unknown> = { ...newRow };
    if (!oldRow) {
      mergedRow._isNewEntry = true;
      return mergedRow;
    }
    const fieldDiffs: Record<string, { old: unknown; new: unknown }> = {};
    Object.keys(newRow).forEach((key) => {
      if (key.startsWith("_")) return;
      const newVal = newRow[key];
      const oldVal = oldRow[key];
      if (newVal !== oldVal && String(newVal).trim() !== String(oldVal).trim()) {
        fieldDiffs[key] = { old: oldVal ?? "—", new: newVal ?? "—" };
      }
    });
    if (Object.keys(fieldDiffs).length > 0) {
      mergedRow._isModified = true;
      mergedRow._diff = fieldDiffs;
      mergedRow._modifiedBy = uploaderName;
    }
    return mergedRow;
  });
  return merged;
}

describe("Report Day Range & Diff Logic", () => {
  it("computes exact day range covering UTC and local bounds for a YYYY-MM-DD string", () => {
    const { dayStart, dayEnd } = getExactDayRange("2026-08-13");
    expect(dayStart instanceof Date).toBe(true);
    expect(dayEnd instanceof Date).toBe(true);
    expect(dayStart.getTime()).toBeLessThan(dayEnd.getTime());

    // Difference between dayEnd and dayStart should cover 24h+ timezone range
    const diffHours = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThanOrEqual(23.9);
  });

  it("computes row diffs when an entry in a report is updated", () => {
    const existingRows = [
      { Code: "101", Item: "Gold", Weight: 50, Price: 100 },
      { Code: "102", Item: "Silver", Weight: 20, Price: 40 },
    ];

    const newRows = [
      { Code: "101", Item: "Gold", Weight: 50, Price: 150 }, // Price changed 100 -> 150
      { Code: "102", Item: "Silver", Weight: 20, Price: 40 },
    ];

    const result = computeRowDiffs(existingRows, newRows, "Tester");

    expect(result[0]._isModified).toBe(true);
    expect(result[0]._diff).toEqual({
      Price: { old: 100, new: 150 },
    });
    expect(result[1]._isModified).toBeUndefined();
  });

  it("leaves previous report data unchanged when diffing for a new report document", () => {
    const previousReportData = [
      { Code: "101", Item: "Gold", Weight: 50, Price: 100 },
    ];

    const currentUploadedData = [
      { Code: "101", Item: "Gold", Weight: 50, Price: 120 },
    ];

    // Shallow copy to verify immutability of previous report data
    const originalPreviousCopy = JSON.parse(JSON.stringify(previousReportData));

    const newReportData = computeRowDiffs(previousReportData, currentUploadedData, "Tester");

    // New report data has diff flags
    expect(newReportData[0]._isModified).toBe(true);
    expect((newReportData[0]._diff as any).Price).toEqual({ old: 100, new: 120 });

    // Previous report data object remains 100% untouched
    expect(previousReportData).toEqual(originalPreviousCopy);
  });
});
