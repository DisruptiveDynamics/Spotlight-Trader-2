/**
 * Golden tests for deterministic backtest validation
 * These tests ensure the backtest engine produces consistent results
 */

import { describe, it, expect, vi } from "vitest";
import { runBacktest } from "./engine";
import { goldenTestCases, expectedTriggers } from "./fixtures";
import * as historyService from "../history/service";

describe("Backtest Golden Tests", () => {
  describe("Deterministic Replay", () => {
    for (const testCase of goldenTestCases) {
      it(testCase.name, async () => {
        // Mock getHistory using vi.spyOn
        const getHistorySpy = vi
          .spyOn(historyService, "getHistory")
          .mockResolvedValue(testCase.bars);

        try {
          const result = await runBacktest({
            symbol: "SPY",
            timeframe: "1m",
            start: new Date(1700000000000).toISOString(),
            end: new Date(1700000300000).toISOString(),
            rules: testCase.rules,
          });

          // Verify trigger count
          expect(result.triggers.length).toBe(testCase.expectedTriggerCount);

          // Verify deterministic ordering (triggers should be ordered chronologically)
          const seqs = result.triggers.map((t) => t.seq);
          const sortedSeqs = [...seqs].sort((a, b) => a - b);
          expect(seqs).toEqual(sortedSeqs);

          // Verify bar count
          expect(result.bars).toBe(testCase.bars.length);

          // Verify first trigger if specified
          if (testCase.expectedFirstTrigger) {
            const firstTrigger = result.triggers[0];
            expect(firstTrigger).toBeDefined();
            expect(firstTrigger!.ruleId).toBe(testCase.expectedFirstTrigger.ruleId);
            expect(firstTrigger!.seq).toBe(testCase.expectedFirstTrigger.seq);
            expect(firstTrigger!.price).toBe(testCase.expectedFirstTrigger.price);
          }

          // Verify per-rule trigger attribution
          for (const rule of testCase.rules) {
            const ruleTriggers = result.triggers.filter((t) => t.ruleId === rule.id);
            const expected = expectedTriggers[rule.id as keyof typeof expectedTriggers];

            if (expected) {
              expect(ruleTriggers.length).toBe(expected.length);

              // Verify each trigger matches expected seq and price
              ruleTriggers.forEach((trigger, idx) => {
                expect(trigger.seq).toBe(expected[idx]!.seq);
                expect(trigger.price).toBe(expected[idx]!.price);
              });
            }
          }

          // Verify metrics match expected values
          expect(result.metrics.avgHoldBars).toBe(testCase.expectedMetrics.avgHoldBars);
          expect(result.metrics.triggersPerDay).toBe(testCase.expectedMetrics.triggersPerDay);
          expect(result.metrics.regimeBreakdown).toEqual(testCase.expectedMetrics.regimeBreakdown);
        } finally {
          getHistorySpy.mockRestore();
        }
      });
    }
  });

  describe("Reproducibility", () => {
    it("should produce identical results on repeated runs", async () => {
      const { sampleBars, sampleRules } = await import("./fixtures");

      const getHistorySpy = vi.spyOn(historyService, "getHistory").mockResolvedValue(sampleBars);

      try {
        const input = {
          symbol: "SPY",
          timeframe: "1m" as const,
          start: new Date(1700000000000).toISOString(),
          end: new Date(1700000300000).toISOString(),
          rules: [sampleRules[0]!],
        };

        const result1 = await runBacktest(input);
        const result2 = await runBacktest(input);

        // Results should be byte-for-byte identical
        expect(result1).toEqual(result2);
        expect(result1.triggers).toEqual(result2.triggers);
        expect(result1.metrics).toEqual(result2.metrics);

        // Verify metrics are deterministic
        expect(result1.metrics.avgHoldBars).toBe(result2.metrics.avgHoldBars);
        expect(result1.metrics.triggersPerDay).toBe(result2.metrics.triggersPerDay);
        expect(result1.metrics.regimeBreakdown).toEqual(result2.metrics.regimeBreakdown);
      } finally {
        getHistorySpy.mockRestore();
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty bar list gracefully", async () => {
      const { sampleRules } = await import("./fixtures");

      const getHistorySpy = vi.spyOn(historyService, "getHistory").mockResolvedValue([]);

      try {
        await expect(
          runBacktest({
            symbol: "SPY",
            timeframe: "1m",
            start: new Date(1700000000000).toISOString(),
            end: new Date(1700000300000).toISOString(),
            rules: [sampleRules[0]!],
          }),
        ).rejects.toThrow("No historical data available");
      } finally {
        getHistorySpy.mockRestore();
      }
    });

    it("should handle rules with no triggers", async () => {
      const { sampleBars } = await import("./fixtures");

      const getHistorySpy = vi.spyOn(historyService, "getHistory").mockResolvedValue(sampleBars);

      try {
        const impossibleRule: import("@shared/types/rules").Rule = {
          id: "impossible",
          name: "Impossible",
          description: "Never triggers",
          expression: "close > 1000",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        };

        const result = await runBacktest({
          symbol: "SPY",
          timeframe: "1m",
          start: new Date(1700000000000).toISOString(),
          end: new Date(1700000300000).toISOString(),
          rules: [impossibleRule],
        });

        expect(result.triggers.length).toBe(0);
        expect(result.metrics.triggersPerDay).toBe(0);
        expect(result.metrics.avgHoldBars).toBe(0);
        expect(Object.keys(result.metrics.regimeBreakdown).length).toBe(0);
      } finally {
        getHistorySpy.mockRestore();
      }
    });
  });
});
