import { describe, expect, it, beforeAll } from "vitest";
import { runBacktest } from "./engine";
import { loadGoldenTestData } from "./testData";
import { Rule } from "../types";

// Preload test data for consistent results
let testData: any;

beforeAll(async () => {
  testData = await loadGoldenTestData();
});

describe("Backtest Golden Tests", () => {
  describe("Deterministic Replay", () => {
    it("Simple price threshold", () => {
      const rule: Rule = {
        id: "test-rule-1",
        name: "Price Above Threshold",
        expression: "price > 400", // Simple price threshold expression
        active: true,
        created_at: new Date().toISOString()
      };

      const result = runBacktest({
        bars: testData.bars,
        rules: [rule],
        options: { deterministic: true }
      });

      // Verify trigger count
      expect(result.triggers.length).toBe(3);

      // Verify triggers are chronologically ordered
      const sortedTriggers = [...result.triggers].sort((a, b) => a.timestamp - b.timestamp);
      expect(result.triggers).toEqual(sortedTriggers);
    });

    it("Volume breakout", () => {
      const rule: Rule = {
        id: "test-rule-2",
        name: "Volume Breakout",
        expression: "volume > 1000000", // Fix: complete expression with no syntax errors
        active: true,
        created_at: new Date().toISOString()
      };

      const result = runBacktest({
        bars: testData.volumeBars || testData.bars,
        rules: [rule],
        options: { deterministic: true }
      });

      expect(result.triggers.length).toBe(2);
    });

    it("Price range", () => {
      const rule: Rule = {
        id: "test-rule-3",
        name: "Price in Range",
        expression: "price >= 395 && price <= 405", // Fix: complete expression with no syntax errors
        active: true,
        created_at: new Date().toISOString()
      };

      const result = runBacktest({
        bars: testData.bars,
        rules: [rule],
        options: { deterministic: true }
      });

      expect(result.triggers.length).toBe(2);
    });
  });

  describe("Reproducibility", () => {
    it("should produce identical results on repeated runs", () => {
      const rule: Rule = {
        id: "test-rule-repro",
        name: "Reproducibility Test",
        expression: "price > 400",
        active: true,
        created_at: new Date().toISOString()
      };

      const result1 = runBacktest({
        bars: testData.bars,
        rules: [rule],
        options: { seed: 12345 }
      });

      const result2 = runBacktest({
        bars: testData.bars,
        rules: [rule],
        options: { seed: 12345 }
      });

      expect(result1).toEqual(result2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty bar list gracefully", () => {
      const rule: Rule = {
        id: "test-rule-empty",
        name: "Empty Test",
        expression: "price > 0",
        active: true,
        created_at: new Date().toISOString()
      };

      const result = runBacktest({
        bars: [],
        rules: [rule]
      });

      expect(result.triggers).toEqual([]);
    });

    it("should handle rules with no triggers", () => {
      const result = runBacktest({
        bars: testData.bars,
        rules: []
      });

      expect(result.triggers).toEqual([]);
    });
  });
});
