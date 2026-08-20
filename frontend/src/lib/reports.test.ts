import { describe, it, expect } from "vitest";
import {
  pairAndAlignLedgerEntries,
  calculateRowTouch,
  calculateOverallTouch,
  consolidateReportsByType,
  classifyLedgerEntry,
  resolveLedgerPaneTitles,
} from "../components/dashboard/DynamicReportViewer";

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

function countRowFieldMatches(
  rowA: Record<string, unknown>,
  rowB: Record<string, unknown>
): number {
  let score = 0;
  const keys = Object.keys(rowA).filter((k) => !k.startsWith("_"));
  for (const k of keys) {
    const valA = normalizeValue(rowA[k]);
    const valB = normalizeValue(getRowValueCaseInsensitive(rowB, k));
    if (valA && valA === valB) {
      score += 2;
    }
  }
  const typeA = normalizeValue(getRowValueCaseInsensitive(rowA, "type"));
  const typeB = normalizeValue(getRowValueCaseInsensitive(rowB, "type"));
  if (typeA && typeA === typeB) score += 5;

  const partyA = normalizeValue(getRowValueCaseInsensitive(rowA, "party"));
  const partyB = normalizeValue(getRowValueCaseInsensitive(rowB, "party"));
  if (partyA && partyA === partyB) score += 3;

  return score;
}

function computeRowDiffs(
  existingRows: Record<string, unknown>[],
  newRows: Record<string, unknown>[],
  uploaderName: string
): Record<string, unknown>[] {
  if (!Array.isArray(existingRows) || existingRows.length === 0) {
    return newRows;
  }

  const sampleNew = newRows[0] || {};
  const sampleOld = existingRows[0] || {};

  const newKeys = Object.keys(sampleNew).filter((k) => !k.startsWith("_"));
  const oldKeys = Object.keys(sampleOld).filter((k) => !k.startsWith("_"));
  const commonKeys = newKeys.filter((k) =>
    oldKeys.some((ok) => ok.trim().toLowerCase() === k.trim().toLowerCase())
  );

  const idPattern = /(id|no|num|code|ref|sr|bill|voucher|serial|trans)/i;
  const primaryIdKeys = commonKeys.filter((k) => idPattern.test(k));

  let primaryKey: string | null = null;
  for (const key of commonKeys) {
    const values = newRows
      .map((r) => r[key])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "");

    const isUnique =
      values.length === newRows.length &&
      new Set(values.map((v) => String(v).trim().toLowerCase())).size === values.length;

    if (isUnique) {
      primaryKey = key;
      break;
    }
  }

  if (!primaryKey && primaryIdKeys.length > 0) {
    primaryKey = primaryIdKeys[0];
  }

  interface ExistingEntry {
    row: Record<string, unknown>;
    originalIdx: number;
    used: boolean;
  }

  const existingKeyGroups = new Map<string, ExistingEntry[]>();
  const allExistingEntries: ExistingEntry[] = existingRows.map((row, idx) => {
    const entry: ExistingEntry = { row, originalIdx: idx, used: false };
    if (primaryKey) {
      const val = getRowValueCaseInsensitive(row, primaryKey);
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        const keyStr = String(val).trim().toLowerCase();
        const list = existingKeyGroups.get(keyStr) || [];
        list.push(entry);
        existingKeyGroups.set(keyStr, list);
      }
    }
    return entry;
  });

  return newRows.map((newRow, idx) => {
    let matchedEntry: ExistingEntry | undefined;

    if (primaryKey) {
      const val = getRowValueCaseInsensitive(newRow, primaryKey);
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        const keyStr = String(val).trim().toLowerCase();
        const group = existingKeyGroups.get(keyStr);
        if (group && group.length > 0) {
          const unusedEntries = group.filter((e) => !e.used);
          if (unusedEntries.length === 1) {
            matchedEntry = unusedEntries[0];
          } else if (unusedEntries.length > 1) {
            let bestScore = -1;
            let bestEntry = unusedEntries[0];
            for (const entry of unusedEntries) {
              let score = countRowFieldMatches(newRow, entry.row);
              if (entry.originalIdx === idx) {
                score += 1;
              }
              if (score > bestScore) {
                bestScore = score;
                bestEntry = entry;
              }
            }
            matchedEntry = bestEntry;
          }
        }
      }
    }

    if (!primaryKey && !matchedEntry && allExistingEntries[idx] && !allExistingEntries[idx].used) {
      matchedEntry = allExistingEntries[idx];
    }

    if (matchedEntry) {
      matchedEntry.used = true;
    }

    const oldRow = matchedEntry?.row;
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

    Object.keys(newRow).forEach((key) => {
      if (key.startsWith("_")) return;

      const newVal = newRow[key];
      const currentOldVal = getRowValueCaseInsensitive(oldRow!, key);

      const prevDiff = existingPrevDiffs[key];
      const originalOldVal = prevDiff?.old !== undefined ? prevDiff.old : currentOldVal;

      const normNew = normalizeValue(newVal);
      const normCurrentOld = normalizeValue(currentOldVal);
      const normOriginalOld = normalizeValue(originalOldVal);

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

  it("accurately diffs multi-row journal vouchers without false positives when only 1 entry is changed", () => {
    const existingJournalRows = [
      {
        "Transaction No": "JV/26-27/0001",
        Party: "KASAR",
        "Book Name": "Journal",
        Type: "[01] Debit",
        "Amount Total": "160.00",
      },
      {
        "Transaction No": "JV/26-27/0001",
        Party: "V G GOLD",
        "Book Name": "Journal",
        Type: "[02] Credit",
        "Amount Total": "160.00",
      },
      {
        "Transaction No": "JV/26-27/0001 Total",
        Party: "",
        "Book Name": "",
        Type: "",
        "Amount Total": "320.00",
      },
      {
        "Transaction No": "JV/26-27/0002",
        Party: "BRAHMANI GOLD",
        "Book Name": "Journal",
        Type: "[01] Debit",
        "Amount Total": "1100000.00",
      },
      {
        "Transaction No": "JV/26-27/0002",
        Party: "HARIKALA BULLION",
        "Book Name": "Journal",
        Type: "[02] Credit",
        "Amount Total": "1100000.00",
      },
    ];

    // User only modified Row 0 Party from 'KASAR' to 'KASAR NEW'
    const newJournalRows = [
      {
        "Transaction No": "JV/26-27/0001",
        Party: "KASAR NEW",
        "Book Name": "Journal",
        Type: "[01] Debit",
        "Amount Total": "160.00",
      },
      {
        "Transaction No": "JV/26-27/0001",
        Party: "V G GOLD",
        "Book Name": "Journal",
        Type: "[02] Credit",
        "Amount Total": "160.00",
      },
      {
        "Transaction No": "JV/26-27/0001 Total",
        Party: "",
        "Book Name": "",
        Type: "",
        "Amount Total": "320.00",
      },
      {
        "Transaction No": "JV/26-27/0002",
        Party: "BRAHMANI GOLD",
        "Book Name": "Journal",
        Type: "[01] Debit",
        "Amount Total": "1100000.00",
      },
      {
        "Transaction No": "JV/26-27/0002",
        Party: "HARIKALA BULLION",
        "Book Name": "Journal",
        Type: "[02] Credit",
        "Amount Total": "1100000.00",
      },
    ];

    const result = computeRowDiffs(existingJournalRows, newJournalRows, "SG Super Admin");

    // Exactly 1 row modified
    const modifiedRows = result.filter((r) => r._isModified);
    expect(modifiedRows.length).toBe(1);

    // Row 0 is the ONLY modified row
    expect(result[0]._isModified).toBe(true);
    expect(result[0]._diff).toEqual({
      Party: { old: "KASAR", new: "KASAR NEW" },
    });

    // Row 1 (Credit), Row 2 (Total), Row 3 (Debit 2), Row 4 (Credit 2) are completely unmodified
    expect(result[1]._isModified).toBeUndefined();
    expect(result[2]._isModified).toBeUndefined();
    expect(result[3]._isModified).toBeUndefined();
    expect(result[4]._isModified).toBeUndefined();
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

  it("selects entries entry-wise (separately for each individual entry)", () => {
    const targetIndex = 1;
    // Each entry is toggled separately (entry-wise selection)
    const selected = [targetIndex];
    expect(selected).toEqual([1]);
    expect(selected).not.toContain(0);
    expect(selected).not.toContain(2);
  });

  it("selects side-by-side paired entries in Metal Journal report", () => {
    const debit = [
      { row: { Party: "AMD GAUTAM JEW", "Net Weight": 17.76 }, index: 1, group: "", groupId: 0 },
    ];
    const credit = [
      { row: { Party: "LABHLAXMI CHAIN", "Net Weight (2)": 17.76 }, index: 3, group: "", groupId: 1 },
    ];
    const { alignedDebit, alignedCredit } = pairAndAlignLedgerEntries(debit, credit);

    // Simulating Metal Journal side-by-side checkbox toggle for targetIndex = 1
    const targetIndex = 1;
    let pairedIndex = -1;
    for (let k = 0; k < alignedDebit.length; k++) {
      const d = alignedDebit[k];
      const c = alignedCredit[k];
      if (d && c && !d.isPlaceholder && !c.isPlaceholder) {
        if (d.index === targetIndex && c.index >= 0) {
          pairedIndex = c.index;
          break;
        }
      }
    }

    expect(pairedIndex).toBe(3);
    const selected = [targetIndex, pairedIndex];
    expect(selected).toContain(1);
    expect(selected).toContain(3);
  });

  it("calculates simple arithmetic average rate for Rate Cut reports", () => {
    const rates = [14630.00, 14672.35, 14780.50, 16000.00, 27879.00, 26857.14];
    const sum = rates.reduce((a, b) => a + b, 0);
    const avg = sum / rates.length;
    expect(sum).toBeCloseTo(114818.99, 2);
    expect(avg).toBeCloseTo(19136.4983, 4);
    expect(Number(avg.toFixed(2))).toBe(19136.50);
  });

  it("correctly tracks and resolves the specific user who checked each row", () => {
    // Simulated report approvals from database with different users for different rows
    const reportApprovals = [
      { rowIndex: 0, approvedBy: "Raj", approvedAt: "2026-08-20T10:00:00Z" },
      { rowIndex: 2, approvedBy: "Simran", approvedAt: "2026-08-20T11:00:00Z" },
    ];

    const approvedByMap: Record<number, string> = {};
    const selected: number[] = [];

    reportApprovals.forEach((app) => {
      if (typeof app.rowIndex === "number") {
        selected.push(app.rowIndex);
        if (app.approvedBy) {
          approvedByMap[app.rowIndex] = app.approvedBy;
        }
      }
    });

    expect(selected).toEqual([0, 2]);
    expect(approvedByMap[0]).toBe("Raj");
    expect(approvedByMap[2]).toBe("Simran");

    // Simulating user "Bhavesh" checking a new row (index 1)
    const currentUser = "Bhavesh";
    const newIndex = 1;
    selected.push(newIndex);
    approvedByMap[newIndex] = currentUser;

    // Helper resolving function (identical to DynamicReportViewer logic)
    const getApprover = (rowIndex: number, rowData: Record<string, unknown> = {}) => {
      return (
        approvedByMap[rowIndex] ||
        (rowData["Checked By"] as string) ||
        (rowData["Approved By"] as string) ||
        "DefaultUser"
      );
    };

    expect(getApprover(0)).toBe("Raj");
    expect(getApprover(1)).toBe("Bhavesh");
    expect(getApprover(2)).toBe("Simran");

    // Simulating unchecking row 0
    delete approvedByMap[0];
    const updatedSelected = selected.filter((idx) => idx !== 0);
    expect(updatedSelected).toEqual([2, 1]);
    expect(approvedByMap[0]).toBeUndefined();
    expect(approvedByMap[2]).toBe("Simran");
    expect(approvedByMap[1]).toBe("Bhavesh");
  });

  it("calculates Touch percentage accurately for Finding Purchases rows", () => {
    const columns = [
      "Party",
      "BookHeadName",
      "Book Name",
      "Transaction No",
      "Gross Weight",
      "Net Weight",
      "Pure Weight",
      "Amount",
    ];

    const row1 = {
      Party: "BADLO KAUSHIK RAJKOT",
      "Net Weight": "186.970",
      "Pure Weight": "175.284",
      Amount: "0.00",
    };

    const row2 = {
      Party: "BADLO KAUSHIK RAJKOT",
      "Net Weight": "45.940",
      "Pure Weight": "43.069",
      Amount: "0.00",
    };

    const row3 = {
      Party: "BADLO KAUSHIK RAJKOT",
      "Net Weight": "112.010",
      "Pure Weight": "85.968",
      Amount: "0.00",
    };

    expect(calculateRowTouch(row1, columns)).toBe("93.75%");
    expect(calculateRowTouch(row2, columns)).toBe("93.75%");
    expect(calculateRowTouch(row3, columns)).toBe("76.75%");
  });

  it("calculates weighted Grand Total Touch percentage for Finding Purchases table", () => {
    const columns = [
      "Party",
      "BookHeadName",
      "Book Name",
      "Transaction No",
      "Gross Weight",
      "Net Weight",
      "Pure Weight",
      "Amount",
    ];

    const rows = [
      {
        "Net Weight": "186.970",
        "Pure Weight": "175.284",
      },
      {
        "Net Weight": "45.940",
        "Pure Weight": "43.069",
      },
      {
        "Net Weight": "112.010",
        "Pure Weight": "85.968",
      },
    ];

    // Total pure: 175.284 + 43.069 + 85.968 = 304.321
    // Total net: 186.970 + 45.940 + 112.010 = 344.920
    // Weighted touch: (304.321 / 344.920) * 100 = 88.2294... -> 88.23%
    const grandTouch = calculateOverallTouch(rows, columns);
    expect(grandTouch).toBe("88.23%");
  });
});

describe("consolidateReportsByType", () => {
  it("should return empty array when input is empty", () => {
    expect(consolidateReportsByType([])).toEqual([]);
  });

  it("should return single report with enriched index metadata", () => {
    const singleReport: any = {
      _id: "rep-1",
      reportId: "rep-1",
      name: "Metal Journal",
      type: "Metal Journal",
      source: "Spreadsheet Upload",
      owner: "Raj",
      createdAt: "2026-08-20T10:00:00.000Z",
      status: "Pending",
      rowsCount: 2,
      headers: ["Vou.No", "Party", "Debit", "Credit"],
      data: [
        { "Vou.No": "101", Party: "Party A", Debit: "100.000", Credit: "" },
        { "Vou.No": "102", Party: "Party B", Debit: "", Credit: "100.000" },
      ],
    };

    const result = consolidateReportsByType([singleReport]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Metal Journal");
    expect((result[0] as any)._isConsolidated).toBe(false);
    expect((result[0] as any)._reportCount).toBe(1);
    expect(result[0].data).toHaveLength(2);
    expect(result[0].data![0]._originalIndex).toBe(0);
    expect(result[0].data![1]._originalIndex).toBe(1);
  });

  it("should consolidate multiple reports of the same type across dates into a single unified report", () => {
    const reportDay1: any = {
      _id: "rep-aug-1",
      reportId: "rep-aug-1",
      name: "Metal Journal",
      type: "Metal Journal",
      source: "Spreadsheet Upload",
      owner: "Raj",
      createdAt: "2026-08-01T08:00:00.000Z",
      headers: ["Vou.No", "Party", "Debit", "Credit"],
      data: [
        { "Vou.No": "MJ-001", Party: "ABC Corp", Debit: "50.000", Credit: "" },
        { "Vou.No": "MJ-002", Party: "XYZ Ltd", Debit: "", Credit: "50.000" },
      ],
      approvals: [
        { rowIndex: 0, rowId: "MJ-001", approvedBy: "Supervisor 1" },
      ],
    };

    const reportDay2: any = {
      _id: "rep-aug-15",
      reportId: "rep-aug-15",
      name: "Metal Journal",
      type: "Metal Journal",
      source: "Spreadsheet Upload",
      owner: "Admin",
      createdAt: "2026-08-15T09:30:00.000Z",
      headers: ["Vou.No", "Party", "Debit", "Credit", "Remarks"],
      data: [
        { "Vou.No": "MJ-003", Party: "PQR Inc", Debit: "75.000", Credit: "", Remarks: "Batch 2" },
      ],
      approvals: [
        { rowIndex: 0, rowId: "MJ-003", approvedBy: "Manager 2" },
      ],
    };

    const result = consolidateReportsByType(
      [reportDay1, reportDay2],
      "2026-08-01",
      "2026-08-15",
    );

    expect(result).toHaveLength(1);
    const consolidated = result[0];

    expect(consolidated.name).toBe("Metal Journal");
    expect((consolidated as any)._isConsolidated).toBe(true);
    expect((consolidated as any)._reportCount).toBe(2);
    expect((consolidated as any)._sourceReportIds).toEqual(["rep-aug-1", "rep-aug-15"]);
    expect((consolidated as any)._dateRangeLabel).toBe("From: 01/08/2026 To: 15/08/2026");

    // All 3 rows should be combined together in chronological order
    expect(consolidated.data).toHaveLength(3);

    // Row 0 from report 1
    expect(consolidated.data![0]["Vou.No"]).toBe("MJ-001");
    expect(consolidated.data![0]._originalIndex).toBe(0);
    expect(consolidated.data![0]._sourceReportId).toBe("rep-aug-1");
    expect(consolidated.data![0]._sourceLocalIndex).toBe(0);

    // Row 1 from report 1
    expect(consolidated.data![1]["Vou.No"]).toBe("MJ-002");
    expect(consolidated.data![1]._originalIndex).toBe(1);
    expect(consolidated.data![1]._sourceReportId).toBe("rep-aug-1");
    expect(consolidated.data![1]._sourceLocalIndex).toBe(1);

    // Row 2 from report 2 (re-indexed continuously)
    expect(consolidated.data![2]["Vou.No"]).toBe("MJ-003");
    expect(consolidated.data![2]._originalIndex).toBe(2);
    expect(consolidated.data![2]._sourceReportId).toBe("rep-aug-15");
    expect(consolidated.data![2]._sourceLocalIndex).toBe(0);

    // Headers should be unified (including "Remarks" and "Date")
    expect(consolidated.headers).toContain("Vou.No");
    expect(consolidated.headers).toContain("Party");
    expect(consolidated.headers).toContain("Debit");
    expect(consolidated.headers).toContain("Credit");
    expect(consolidated.headers).toContain("Remarks");

    // Approvals should be re-mapped to global indexes:
    // Report 1 rowIndex 0 -> global rowIndex 0
    // Report 2 rowIndex 0 -> global rowIndex 2
    expect(consolidated.approvals).toHaveLength(2);
    expect(consolidated.approvals![0].rowIndex).toBe(0);
    expect(consolidated.approvals![0].approvedBy).toBe("Supervisor 1");
    expect(consolidated.approvals![1].rowIndex).toBe(2);
    expect(consolidated.approvals![1].approvedBy).toBe("Manager 2");
  });

  it("should group different report types into distinct consolidated reports", () => {
    const metalJournal1: any = {
      _id: "mj-1",
      name: "Metal Journal",
      type: "Metal Journal",
      createdAt: "2026-08-01",
      data: [{ "Vou.No": "MJ-1" }],
    };
    const metalJournal2: any = {
      _id: "mj-2",
      name: "Metal Journal",
      type: "Metal Journal",
      createdAt: "2026-08-05",
      data: [{ "Vou.No": "MJ-2" }],
    };
    const melting1: any = {
      _id: "m-1",
      name: "Melting Report",
      type: "Melting",
      createdAt: "2026-08-02",
      data: [{ "Lot.No": "LOT-1" }],
    };

    const result = consolidateReportsByType([metalJournal1, melting1, metalJournal2]);
    expect(result).toHaveLength(2);

    const mj = result.find((r) => r.type === "Metal Journal");
    const melting = result.find((r) => r.type === "Melting" || r.name === "Melting Report");

    expect(mj).toBeDefined();
    expect(mj!.data).toHaveLength(2);
    expect((mj as any)._isConsolidated).toBe(true);

    expect(melting).toBeDefined();
    expect(melting!.data).toHaveLength(1);
    expect((melting as any)._isConsolidated).toBe(false);
  });

  it("should preserve all 3,000+ rows when consolidating large reports", () => {
    const largeDataset = Array.from({ length: 3000 }, (_, i) => ({
      "Vou.No": `VOU-${i + 1}`,
      Party: `Party ${i % 50}`,
      Debit: i % 2 === 0 ? String(100 + i) : "",
      Credit: i % 2 !== 0 ? String(100 + i) : "",
    }));

    const largeReport: any = {
      _id: "rep-3000",
      name: "Metal Journal Large",
      type: "Metal Journal",
      createdAt: "2026-08-15",
      data: largeDataset,
      headers: ["Vou.No", "Party", "Debit", "Credit"],
    };

    const result = consolidateReportsByType([largeReport]);
    expect(result).toHaveLength(1);
    expect(result[0].data).toHaveLength(3000);
    expect(result[0].data![0]["Vou.No"]).toBe("VOU-1");
    expect(result[0].data![2999]["Vou.No"]).toBe("VOU-3000");
  });
});

describe("Journal Ledger Debit/Credit Classification and Pane Title Resolution", () => {
  const journalCols = [
    "EntryDate",
    "Party",
    "Book Name",
    "Type",
    "Amount",
    "Transaction No",
  ];

  const sampleJournalRows = [
    {
      EntryDate: "8/1/26 11:23",
      Party: "HDFC BHAVESHBHAI HUF",
      "Book Name": "Journal",
      Type: "[02] Credit",
      Amount: "25000.00",
      "Transaction No": "0",
    },
    {
      EntryDate: "8/1/26 11:23",
      Party: "INCOME TAX",
      "Book Name": "Journal",
      Type: "[01] Debit",
      Amount: "25000.00",
      "Transaction No": "0",
    },
    {
      EntryDate: "8/1/26 11:28",
      Party: "BANK CHARGES",
      "Book Name": "Journal",
      Type: "[01] Debit",
      Amount: "3064.46",
      "Transaction No": "0",
    },
    {
      EntryDate: "8/1/26 11:28",
      Party: "HDFC BHAVESHBHAI HUF",
      "Book Name": "Salary Journal",
      Type: "[02] Credit",
      Amount: "3064.46",
      "Transaction No": "0",
    },
  ];

  it("strictly separates Debit [01] rows into Left and Credit [02] rows into Right pane without duplicates", () => {
    const debitRows = sampleJournalRows.filter(
      (r) => classifyLedgerEntry(r, journalCols, "Type") === "debit",
    );
    const creditRows = sampleJournalRows.filter(
      (r) => classifyLedgerEntry(r, journalCols, "Type") === "credit",
    );

    expect(debitRows).toHaveLength(2);
    expect(creditRows).toHaveLength(2);

    expect(debitRows.map((r) => r.Party)).toEqual([
      "INCOME TAX",
      "BANK CHARGES",
    ]);
    expect(creditRows.map((r) => r.Party)).toEqual([
      "HDFC BHAVESHBHAI HUF",
      "HDFC BHAVESHBHAI HUF",
    ]);

    // Ensure mutually exclusive
    const overlap = debitRows.filter((dr) => creditRows.includes(dr));
    expect(overlap).toHaveLength(0);
  });

  it("resolves clean pane titles ([01] Debit / [02] Credit) instead of concatenating book names", () => {
    const debitEntries = sampleJournalRows
      .filter((r) => classifyLedgerEntry(r, journalCols, "Type") === "debit")
      .map((row, index) => ({ row, index, group: "", groupId: index }));

    const creditEntries = sampleJournalRows
      .filter((r) => classifyLedgerEntry(r, journalCols, "Type") === "credit")
      .map((row, index) => ({ row, index, group: "", groupId: index }));

    const { leftTitle, rightTitle } = resolveLedgerPaneTitles({
      isRateCut: false,
      isFinding: false,
      isMetalJournal: false,
      debit: debitEntries,
      credit: creditEntries,
      typeCol: "Type",
    });

    // Titles must NOT be "JOURNAL / SALARY JOURNAL"
    expect(leftTitle).not.toContain("Salary Journal");
    expect(rightTitle).not.toContain("Salary Journal");

    expect(leftTitle).toBe("[01] Debit");
    expect(rightTitle).toBe("[02] Credit");
  });

  it("falls back to DEBIT (DR) and CREDIT (CR) for standard financial ledgers without explicit Type column", () => {
    const debitEntries = [
      { row: { Party: "Client A", Debit: "1000", Credit: "0" }, index: 0, group: "", groupId: 0 },
    ];
    const creditEntries = [
      { row: { Party: "Client B", Debit: "0", Credit: "1000" }, index: 1, group: "", groupId: 1 },
    ];

    const { leftTitle, rightTitle } = resolveLedgerPaneTitles({
      isRateCut: false,
      isFinding: false,
      isMetalJournal: false,
      debit: debitEntries,
      credit: creditEntries,
    });

    expect(leftTitle).toBe("DEBIT (DR)");
    expect(rightTitle).toBe("CREDIT (CR)");
  });
});


