import { describe, it, expect } from "vitest";

describe("Snapshot Hash - Deterministic Hashing & Change Detection", () => {
  interface Bar {
    symbol: string;
    seq: number;
    bar_start: number;
    bar_end: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timeframe: string;
  }

  const calculateSnapshotHash = (
    bars: Bar[],
    timeframe: string
  ): string => {
    if (bars.length === 0) return `0-0-${timeframe}-0`;
    
    const seqLast = bars[bars.length - 1]!.seq;
    const firstBarTime = bars[0]!.bar_start;
    const barCount = bars.length;
    
    return `${seqLast}-${firstBarTime}-${timeframe}-${barCount}`;
  };

  const hasSnapshotChanged = (
    currentHash: string,
    lastSeenHash?: string
  ): boolean | undefined => {
    if (!lastSeenHash) return undefined;
    return currentHash !== lastSeenHash;
  };

  describe("Deterministic Hashing", () => {
    it("should produce same hash for identical bar sets", () => {
      const bars: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000000,
          bar_end: 1060000,
          open: 450,
          high: 452,
          low: 449,
          close: 451,
          volume: 10000,
          timeframe: "1m",
        },
        {
          symbol: "SPY",
          seq: 101,
          bar_start: 1060000,
          bar_end: 1120000,
          open: 451,
          high: 453,
          low: 450,
          close: 452,
          volume: 12000,
          timeframe: "1m",
        },
      ];

      const hash1 = calculateSnapshotHash(bars, "1m");
      const hash2 = calculateSnapshotHash(bars, "1m");

      expect(hash1).toBe(hash2);
    });

    it("should produce consistent hash format", () => {
      const bars: Bar[] = [
        {
          symbol: "SPY",
          seq: 42,
          bar_start: 5000,
          bar_end: 6000,
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const hash = calculateSnapshotHash(bars, "1m");
      
      expect(hash).toMatch(/^\d+-\d+-\w+-\d+$/);
      expect(hash).toBe("42-5000-1m-1");
    });

    it("should include all hash components", () => {
      const bars: Bar[] = [
        {
          symbol: "SPY",
          seq: 10,
          bar_start: 2000,
          bar_end: 3000,
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          volume: 100,
          timeframe: "5m",
        },
        {
          symbol: "SPY",
          seq: 20,
          bar_start: 2000,
          bar_end: 3000,
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          volume: 100,
          timeframe: "5m",
        },
      ];

      const hash = calculateSnapshotHash(bars, "5m");
      const [seqLast, firstBarTime, timeframe, barCount] = hash.split("-");

      expect(seqLast).toBe("20");
      expect(firstBarTime).toBe("2000");
      expect(timeframe).toBe("5m");
      expect(barCount).toBe("2");
    });

    it("should handle empty bar array", () => {
      const hash = calculateSnapshotHash([], "1m");
      
      expect(hash).toBe("0-0-1m-0");
    });
  });

  describe("Change Detection", () => {
    it("should detect change when new bar added", () => {
      const bars1: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000,
          bar_end: 2000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const bars2: Bar[] = [
        ...bars1,
        {
          symbol: "SPY",
          seq: 101,
          bar_start: 1000,
          bar_end: 3000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const hash1 = calculateSnapshotHash(bars1, "1m");
      const hash2 = calculateSnapshotHash(bars2, "1m");

      expect(hasSnapshotChanged(hash2, hash1)).toBe(true);
    });

    it("should not detect change for identical snapshots", () => {
      const bars: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000,
          bar_end: 2000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const hash1 = calculateSnapshotHash(bars, "1m");
      const hash2 = calculateSnapshotHash(bars, "1m");

      expect(hasSnapshotChanged(hash2, hash1)).toBe(false);
    });

    it("should return undefined when no lastSeenHash provided", () => {
      const bars: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000,
          bar_end: 2000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const hash = calculateSnapshotHash(bars, "1m");
      
      expect(hasSnapshotChanged(hash)).toBeUndefined();
    });

    it("should detect change when sequence number updates", () => {
      const bars1: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000,
          bar_end: 2000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const bars2: Bar[] = [
        {
          ...bars1[0]!,
          seq: 101,
        },
      ];

      const hash1 = calculateSnapshotHash(bars1, "1m");
      const hash2 = calculateSnapshotHash(bars2, "1m");

      expect(hasSnapshotChanged(hash2, hash1)).toBe(true);
    });
  });

  describe("Hash Stability", () => {
    it("should produce same hash regardless of OHLCV values", () => {
      const bars1: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000,
          bar_end: 2000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const bars2: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000,
          bar_end: 2000,
          open: 200,
          high: 201,
          low: 199,
          close: 200,
          volume: 5000,
          timeframe: "1m",
        },
      ];

      const hash1 = calculateSnapshotHash(bars1, "1m");
      const hash2 = calculateSnapshotHash(bars2, "1m");

      expect(hash1).toBe(hash2);
    });

    it("should be stable across multiple timeframes", () => {
      const bars: Bar[] = [
        {
          symbol: "SPY",
          seq: 100,
          bar_start: 1000,
          bar_end: 2000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const hash1m = calculateSnapshotHash(bars, "1m");
      const hash5m = calculateSnapshotHash(bars, "5m");

      expect(hash1m).toContain("-1m-");
      expect(hash5m).toContain("-5m-");
    });

    it("should handle large sequences", () => {
      const bars: Bar[] = [
        {
          symbol: "SPY",
          seq: 999999,
          bar_start: 9999999999,
          bar_end: 9999999999,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          timeframe: "1m",
        },
      ];

      const hash = calculateSnapshotHash(bars, "1m");
      
      expect(hash).toBe("999999-9999999999-1m-1");
    });
  });

  describe("Integration Scenarios", () => {
    it("should track changes across multiple updates", () => {
      const updates: Bar[][] = [
        [
          {
            symbol: "SPY",
            seq: 1,
            bar_start: 1000,
            bar_end: 2000,
            open: 100,
            high: 101,
            low: 99,
            close: 100,
            volume: 1000,
            timeframe: "1m",
          },
        ],
        [
          {
            symbol: "SPY",
            seq: 1,
            bar_start: 1000,
            bar_end: 2000,
            open: 100,
            high: 101,
            low: 99,
            close: 100,
            volume: 1000,
            timeframe: "1m",
          },
          {
            symbol: "SPY",
            seq: 2,
            bar_start: 2000,
            bar_end: 3000,
            open: 100,
            high: 101,
            low: 99,
            close: 100,
            volume: 1000,
            timeframe: "1m",
          },
        ],
      ];

      const hashes = updates.map(bars => calculateSnapshotHash(bars, "1m"));
      
      expect(hasSnapshotChanged(hashes[1]!, hashes[0])).toBe(true);
    });

    it("should efficiently detect no change", () => {
      const bars: Bar[] = Array.from({ length: 100 }, (_, i) => ({
        symbol: "SPY",
        seq: i + 1,
        bar_start: 1000 + i * 60000,
        bar_end: 1000 + (i + 1) * 60000,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000,
        timeframe: "1m",
      }));

      const hash1 = calculateSnapshotHash(bars, "1m");
      const hash2 = calculateSnapshotHash(bars, "1m");

      expect(hasSnapshotChanged(hash2, hash1)).toBe(false);
    });
  });
});
