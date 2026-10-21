import { describe, it, expect } from "vitest";
import {
  isShipmentOver1Lakh,
  getTriangleBadgeAmount,
  getRateInsuranceCode,
} from "./CreateCourierView";

describe("Courier Insurance Calculation Rules", () => {
  describe("isShipmentOver1Lakh", () => {
    it("returns false when amount is less than 1,00,000", () => {
      expect(isShipmentOver1Lakh(0, 10000)).toBe(false);
      expect(isShipmentOver1Lakh(50000, 10000)).toBe(false);
      expect(isShipmentOver1Lakh(99999, 10000)).toBe(false);
    });

    it("returns true when amount is 1,00,000 or greater", () => {
      expect(isShipmentOver1Lakh(100000, 10000)).toBe(true);
      expect(isShipmentOver1Lakh(105000, 10000)).toBe(true);
      expect(isShipmentOver1Lakh(140000, 10000)).toBe(true);
    });
  });

  describe("getTriangleBadgeAmount", () => {
    it("shows default placeholder when amount is not provided", () => {
      expect(getTriangleBadgeAmount(0, 10000)).toBe("10000");
    });

    it("does NOT minus insurance when amount is less than 1,00,000", () => {
      // For amount < 100,000: triangle displays full amount without minus insurance
      expect(getTriangleBadgeAmount(50000, 10000)).toBe("50,000");
      expect(getTriangleBadgeAmount(15000, 10000)).toBe("15,000");
      expect(getTriangleBadgeAmount(99000, 10000)).toBe("99,000");
    });

    it("displays the insurance amount when amount is 1,00,000 or greater", () => {
      // For amount >= 100,000: triangle displays insurance amount (e.g. 10000)
      expect(getTriangleBadgeAmount(100000, 10000)).toBe("10000");
      expect(getTriangleBadgeAmount(140000, 10000)).toBe("10000");
      expect(getTriangleBadgeAmount(250000, 15000)).toBe("15000");
    });
  });

  describe("getRateInsuranceCode", () => {
    it("returns '----' when rate/amount is 0 or empty", () => {
      expect(getRateInsuranceCode(0, 10000)).toBe("----");
    });

    it("deducts insurance when amount is 1,00,000 or greater", () => {
      // e.g. 1,40,000 - 10,000 = 1,30,000 -> 130
      expect(getRateInsuranceCode(140000, 10000)).toBe("130");
      // 1,77,500 - 10,000 = 1,67,500 -> 1675 rounds up to 1680 (or 168)
      expect(getRateInsuranceCode(177500, 10000)).toBe("170");
      // 1,00,000 - 10,000 = 90,000 -> 900
      expect(getRateInsuranceCode(100000, 10000)).toBe("900");
    });

    it("does NOT deduct insurance when amount is less than 1,00,000", () => {
      // e.g. 13,000 without minus insurance -> 130
      expect(getRateInsuranceCode(13000, 10000)).toBe("130");
      // 50,000 without minus insurance -> 500
      expect(getRateInsuranceCode(50000, 10000)).toBe("500");
    });
  });
});
