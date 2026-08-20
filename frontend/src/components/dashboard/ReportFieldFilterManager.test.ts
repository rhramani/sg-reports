import { describe, it, expect } from "vitest";
import {
  evaluateRowAgainstRule,
  filterRowsWithRules,
  isNumericField,
  isDateField,
  parseNumericValue,
  type FieldFilterRule,
} from "./ReportFieldFilterManager";

describe("ReportFieldFilterManager Unit Tests", () => {
  const sampleRows = [
    {
      _originalIndex: 0,
      Date: "2026-08-01",
      "Vou.No": "101",
      Party: "SHREEJI JEWELLERS",
      Item: "Gold Bar",
      "Gross Wt": "100.500",
      "Fine Wt": "99.500",
      Rate: "72000",
      Amount: "716400",
      "P.Type": "Sale",
      Status: "Approved",
    },
    {
      _originalIndex: 1,
      Date: "2026-08-02",
      "Vou.No": "102",
      Party: "RAJ TRADERS",
      Item: "Gold Coin",
      "Gross Wt": "50.250",
      "Fine Wt": "50.000",
      Rate: "72100",
      Amount: "360500",
      "P.Type": "Purchase",
      Status: "Pending",
    },
    {
      _originalIndex: 2,
      Date: "2026-08-03",
      "Vou.No": "103",
      Party: "KISHAN ORNAMENTS",
      Item: "Silver Chain",
      "Gross Wt": "250.000",
      "Fine Wt": "240.000",
      Rate: "85000",
      Amount: "204000",
      "P.Type": "Sale",
      Status: "Approved",
    },
    {
      _originalIndex: 3,
      Date: "2026-08-04",
      "Vou.No": "104",
      Party: "RAJ TRADERS",
      Item: "Gold Ring",
      "Gross Wt": "10.000",
      "Fine Wt": "9.160",
      Rate: "72500",
      Amount: "66410",
      "P.Type": "Sale",
      Status: "Draft",
    },
  ];

  describe("Helper Functions", () => {
    it("identifies numeric and date fields correctly", () => {
      expect(isNumericField("Gross Wt")).toBe(true);
      expect(isNumericField("Fine Wt")).toBe(true);
      expect(isNumericField("Rate")).toBe(true);
      expect(isNumericField("Amount")).toBe(true);
      expect(isNumericField("Party")).toBe(false);

      expect(isDateField("Date")).toBe(true);
      expect(isDateField("Party")).toBe(false);
    });

    it("parses numeric values accurately", () => {
      expect(parseNumericValue("100.500")).toBe(100.5);
      expect(parseNumericValue("71,640.00")).toBe(71640);
      expect(parseNumericValue("—")).toBe(null);
      expect(parseNumericValue("-")).toBe(null);
      expect(parseNumericValue(null)).toBe(null);
    });
  });

  describe("Rule Evaluation", () => {
    it("evaluates text 'contains' rule", () => {
      const rule: FieldFilterRule = {
        id: "1",
        field: "Party",
        operator: "contains",
        value: "RAJ",
      };
      expect(evaluateRowAgainstRule(sampleRows[0], rule)).toBe(false);
      expect(evaluateRowAgainstRule(sampleRows[1], rule)).toBe(true);
      expect(evaluateRowAgainstRule(sampleRows[3], rule)).toBe(true);
    });

    it("evaluates text 'equals' and 'not_equals' rule", () => {
      const eqRule: FieldFilterRule = {
        id: "2",
        field: "P.Type",
        operator: "equals",
        value: "Purchase",
      };
      expect(evaluateRowAgainstRule(sampleRows[0], eqRule)).toBe(false);
      expect(evaluateRowAgainstRule(sampleRows[1], eqRule)).toBe(true);

      const notEqRule: FieldFilterRule = {
        id: "3",
        field: "P.Type",
        operator: "not_equals",
        value: "Purchase",
      };
      expect(evaluateRowAgainstRule(sampleRows[0], notEqRule)).toBe(true);
      expect(evaluateRowAgainstRule(sampleRows[1], notEqRule)).toBe(false);
    });

    it("evaluates numeric 'greater_than' and 'less_than' rules", () => {
      const gtRule: FieldFilterRule = {
        id: "4",
        field: "Gross Wt",
        operator: "greater_than",
        value: "50.25",
      };
      expect(evaluateRowAgainstRule(sampleRows[0], gtRule)).toBe(true); // 100.5 > 50.25
      expect(evaluateRowAgainstRule(sampleRows[1], gtRule)).toBe(false); // 50.25 not > 50.25
      expect(evaluateRowAgainstRule(sampleRows[2], gtRule)).toBe(true); // 250 > 50.25

      const ltRule: FieldFilterRule = {
        id: "5",
        field: "Gross Wt",
        operator: "less_than",
        value: "50",
      };
      expect(evaluateRowAgainstRule(sampleRows[3], ltRule)).toBe(true); // 10 < 50
      expect(evaluateRowAgainstRule(sampleRows[0], ltRule)).toBe(false); // 100.5 not < 50
    });

    it("evaluates numeric 'between' rule", () => {
      const betweenRule: FieldFilterRule = {
        id: "6",
        field: "Gross Wt",
        operator: "between",
        value: "40",
        value2: "150",
      };
      expect(evaluateRowAgainstRule(sampleRows[0], betweenRule)).toBe(true); // 100.5
      expect(evaluateRowAgainstRule(sampleRows[1], betweenRule)).toBe(true); // 50.25
      expect(evaluateRowAgainstRule(sampleRows[2], betweenRule)).toBe(false); // 250.0
      expect(evaluateRowAgainstRule(sampleRows[3], betweenRule)).toBe(false); // 10.0
    });

    it("evaluates 'in' (multi-select) rule", () => {
      const inRule: FieldFilterRule = {
        id: "7",
        field: "Party",
        operator: "in",
        value: "",
        selectedValues: ["SHREEJI JEWELLERS", "KISHAN ORNAMENTS"],
      };
      expect(evaluateRowAgainstRule(sampleRows[0], inRule)).toBe(true);
      expect(evaluateRowAgainstRule(sampleRows[1], inRule)).toBe(false);
      expect(evaluateRowAgainstRule(sampleRows[2], inRule)).toBe(true);
      expect(evaluateRowAgainstRule(sampleRows[3], inRule)).toBe(false);
    });
  });

  describe("filterRowsWithRules (Integration)", () => {
    it("filters with multiple rules in AND (all) mode", () => {
      const rules: FieldFilterRule[] = [
        { id: "1", field: "Party", operator: "contains", value: "RAJ" },
        { id: "2", field: "P.Type", operator: "equals", value: "Sale" },
      ];
      const res = filterRowsWithRules(sampleRows, rules, "all");
      expect(res).toHaveLength(1);
      expect(res[0]["Vou.No"]).toBe("104");
    });

    it("filters with multiple rules in OR (any) mode", () => {
      const rules: FieldFilterRule[] = [
        { id: "1", field: "Item", operator: "equals", value: "Silver Chain" },
        { id: "2", field: "Item", operator: "equals", value: "Gold Coin" },
      ];
      const res = filterRowsWithRules(sampleRows, rules, "any");
      expect(res).toHaveLength(2);
      expect(res.map((r) => r["Vou.No"])).toEqual(["102", "103"]);
    });

    it("applies quick column search alongside rules", () => {
      const rules: FieldFilterRule[] = [
        { id: "1", field: "P.Type", operator: "equals", value: "Sale" },
      ];
      const quickFilters = { "Vou.No": "103" };
      const res = filterRowsWithRules(sampleRows, rules, "all", quickFilters);
      expect(res).toHaveLength(1);
      expect(res[0].Party).toBe("KISHAN ORNAMENTS");
    });

    it("applies report-wide text search", () => {
      const res = filterRowsWithRules(sampleRows, [], "all", {}, "Silver");
      expect(res).toHaveLength(1);
      expect(res[0]["Vou.No"]).toBe("103");
    });
  });
});
