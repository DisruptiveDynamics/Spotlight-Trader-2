import { describe, it, expect } from "vitest";

import { computeBarHash, reconcileBars } from "./barHash";

describe("barHash", () => {
  describe("computeBarHash", () => {
    it("should compute consistent hash for same bar", () => {
      const bar = {
        bar_end: 1700000000000,
        ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
      };

      const hash1 = computeBarHash(bar);
      const hash2 = computeBarHash(bar);

      expect(hash1).toBe(hash2);
      expect(hash1).toBeTruthy();
    });

    it("should compute different hashes for different bars", () => {
      const bar1 = {
        bar_end: 1700000000000,
        ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
      };

      const bar2 = {
        bar_end: 1700000060000, // Different timestamp
        ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
      };

      const hash1 = computeBarHash(bar1);
      const hash2 = computeBarHash(bar2);

      expect(hash1).not.toBe(hash2);
    });

    it("should detect OHLC differences", () => {
      const bar1 = {
        bar_end: 1700000000000,
        ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
      };

      const bar2 = {
        bar_end: 1700000000000,
        ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.6, v: 1000 }, // Different close
      };

      const hash1 = computeBarHash(bar1);
      const hash2 = computeBarHash(bar2);

      expect(hash1).not.toBe(hash2);
    });

    it("should detect volume differences", () => {
      const bar1 = {
        bar_end: 1700000000000,
        ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
      };

      const bar2 = {
        bar_end: 1700000000000,
        ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1001 }, // Different volume
      };

      const hash1 = computeBarHash(bar1);
      const hash2 = computeBarHash(bar2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("reconcileBars", () => {
    it("should identify bars to add (missing in local)", () => {
      const localBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
      ];

      const serverBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
        {
          seq: 2,
          bar_end: 1700000060000,
          ohlcv: { o: 100.5, h: 101.5, l: 100.0, c: 101.0, v: 1200 },
        },
      ];

      const result = reconcileBars(localBars, serverBars);

      expect(result.toAdd).toHaveLength(1);
      expect(result.toAdd[0]?.seq).toBe(2);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.reconciled).toBe(1);
    });

    it("should identify bars to update (hash mismatch)", () => {
      const localBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
      ];

      const serverBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.6, v: 1000 }, // Different close
        },
      ];

      const result = reconcileBars(localBars, serverBars);

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0]?.seq).toBe(1);
      expect(result.toAdd).toHaveLength(0);
      expect(result.reconciled).toBe(1);
    });

    it("should handle no differences", () => {
      const bars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
      ];

      const result = reconcileBars(bars, bars);

      expect(result.toAdd).toHaveLength(0);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.reconciled).toBe(0);
    });

    it("should handle gap scenario (simulate missing seq)", () => {
      const localBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
        // Missing seq 2, 3
        {
          seq: 4,
          bar_end: 1700000180000,
          ohlcv: { o: 102.0, h: 103.0, l: 101.5, c: 102.5, v: 1500 },
        },
      ];

      const serverBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
        {
          seq: 2,
          bar_end: 1700000060000,
          ohlcv: { o: 100.5, h: 101.5, l: 100.0, c: 101.0, v: 1200 },
        },
        {
          seq: 3,
          bar_end: 1700000120000,
          ohlcv: { o: 101.0, h: 102.0, l: 100.5, c: 101.5, v: 1300 },
        },
        {
          seq: 4,
          bar_end: 1700000180000,
          ohlcv: { o: 102.0, h: 103.0, l: 101.5, c: 102.5, v: 1500 },
        },
      ];

      const result = reconcileBars(localBars, serverBars);

      expect(result.toAdd).toHaveLength(2); // seq 2, 3
      expect(result.toUpdate).toHaveLength(0);
      expect(result.reconciled).toBe(2);
    });

    it("should handle diff resolution (volume update)", () => {
      const localBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
        {
          seq: 2,
          bar_end: 1700000060000,
          ohlcv: { o: 100.5, h: 101.5, l: 100.0, c: 101.0, v: 1200 },
        },
      ];

      const serverBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
        {
          seq: 2,
          bar_end: 1700000060000,
          ohlcv: { o: 100.5, h: 101.5, l: 100.0, c: 101.0, v: 1250 }, // Volume updated
        },
      ];

      const result = reconcileBars(localBars, serverBars);

      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0]?.seq).toBe(2);
      expect(result.toUpdate[0]?.ohlcv.v).toBe(1250);
      expect(result.toAdd).toHaveLength(0);
      expect(result.reconciled).toBe(1);
    });

    it("should handle empty local state (cold start)", () => {
      const localBars: any[] = [];

      const serverBars = [
        {
          seq: 1,
          bar_end: 1700000000000,
          ohlcv: { o: 100.0, h: 101.0, l: 99.0, c: 100.5, v: 1000 },
        },
        {
          seq: 2,
          bar_end: 1700000060000,
          ohlcv: { o: 100.5, h: 101.5, l: 100.0, c: 101.0, v: 1200 },
        },
      ];

      const result = reconcileBars(localBars, serverBars);

      expect(result.toAdd).toHaveLength(2);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.reconciled).toBe(2);
    });
  });
});
