import { describe, it, expect } from "vitest";
import { pairAndAlignLedgerEntries } from "../components/dashboard/DynamicReportViewer";

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

  it("classifies Metal Journal rows into Receive and Return and calculates Net Balance", () => {
    const rows = [
      {
        Party: "AMD GAUTAM JEW",
        "Book Name": "Metal Transfer Receive",
        "Transaction No": "MTR/26-27/0009",
        "Net Weight": 25.39,
        "Pure Weight": 25.39,
        Amount: 0.0,
      },
      {
        Party: "AMD GAUTAM JEW",
        "Book Name": "Metal Transfer Receive",
        "Transaction No": "MTR/26-27/0024",
        "Net Weight": 17.76,
        "Pure Weight": 17.76,
        Amount: 0.0,
      },
      {
        Party: "BADLO KAUSHIK RAJKOT",
        "Book Name": "Metal Transfer Issue",
        "Transaction No": "MTI/26-27/0009",
        "Net Weight (2)": 29.35,
        "Pure Weight (2)": 29.35,
        Amount: 0.0,
      },
      {
        Party: "BADLO KAUSHIK RAJKOT",
        "Book Name": "Metal Transfer Issue",
        "Transaction No": "MTI/26-27/0012",
        "Net Weight (2)": 100.0,
        "Pure Weight (2)": 100.0,
        Amount: 0.0,
      },
    ];

    const receiveEntries = rows.filter((r) =>
      /receive|mtr|plus/i.test(r["Book Name"]),
    );
    const returnEntries = rows.filter((r) =>
      /issue|mti|minus/i.test(r["Book Name"]),
    );

    expect(receiveEntries.length).toBe(2);
    expect(returnEntries.length).toBe(2);

    const totalReceiveNet = receiveEntries.reduce(
      (sum, r) => sum + (r["Net Weight"] || 0),
      0,
    );
    const totalReturnNet = returnEntries.reduce(
      (sum, r) => sum + (r["Net Weight (2)"] || 0),
      0,
    );

    expect(totalReceiveNet).toBeCloseTo(43.15, 2);
    expect(totalReturnNet).toBeCloseTo(129.35, 2);

    const netWeightBalance = totalReceiveNet - totalReturnNet;
    expect(netWeightBalance).toBeCloseTo(-86.2, 2);
  });

  it("pairs and aligns Metal Transfer Receive and Issue entries side-by-side by weight", () => {
    const debit = [
      {
        row: {
          Party: "AMD GAUTAM JEW",
          "Book Name": "Metal Transfer Receive",
          "Transaction No": "MTR/26-27/0024",
          "Net Weight": 17.76,
          "Pure Weight": 17.76,
        },
        index: 0,
        group: "MTR/26-27/0024",
        groupId: 0,
      },
      {
        row: {
          Party: "DIVA CHAIN",
          "Book Name": "Metal Transfer Receive",
          "Transaction No": "MTR/26-27/0023",
          "Net Weight": 0.023,
          "Pure Weight": 0.023,
        },
        index: 1,
        group: "MTR/26-27/0023",
        groupId: 1,
      },
    ];

    const credit = [
      {
        row: {
          Party: "BADLO KAUSHIK RAJKOT",
          "Book Name": "Metal Transfer Issue",
          "Transaction No": "MTI/26-27/0009",
          "Net Weight (2)": 29.35,
          "Pure Weight (2)": 29.35,
        },
        index: 2,
        group: "MTI/26-27/0009",
        groupId: 2,
      },
      {
        row: {
          Party: "LABHLAXMI CHAIN",
          "Book Name": "Metal Transfer Issue",
          "Transaction No": "MTI/26-27/0019",
          "Net Weight (2)": 17.76,
          "Pure Weight (2)": 17.76,
        },
        index: 3,
        group: "MTI/26-27/0019",
        groupId: 3,
      },
    ];

    const { alignedDebit, alignedCredit, matchedCount } = pairAndAlignLedgerEntries(debit, credit);

    expect(matchedCount).toBe(1);
    // Row 0 should have AMD GAUTAM JEW on left and LABHLAXMI CHAIN on right (both 17.760g)
    expect(alignedDebit[0].row.Party).toBe("AMD GAUTAM JEW");
    expect(alignedCredit[0].row.Party).toBe("LABHLAXMI CHAIN");
    expect(alignedDebit[0].matchedPairId).toBeDefined();
    expect(alignedCredit[0].matchedPairId).toBe(alignedDebit[0].matchedPairId);

    // Row 1 should have DIVA CHAIN on left and placeholder on right
    expect(alignedDebit[1].row.Party).toBe("DIVA CHAIN");
    expect(alignedCredit[1].isPlaceholder).toBe(true);

    // Row 2 should have placeholder on left and unmatched BADLO KAUSHIK RAJKOT on right
    expect(alignedDebit[2].isPlaceholder).toBe(true);
    expect(alignedCredit[2].row.Party).toBe("BADLO KAUSHIK RAJKOT");
  });
});

