import { describe, it, expect } from "vitest";
import { computeSeq, toFlatBar } from "../market/barBuilder";

describe("barBuilder helpers", () => {
  it("computeSeq uses floor(bar_start/60000) deterministically", () => {
    // 2025-01-01T00:00:00.000Z => 0
    expect(computeSeq(0)).toBe(0);
    // 2025-01-01T00:00:59.999Z => still 0
    expect(computeSeq(59_999)).toBe(0);
    // Next minute starts at 60_000
    expect(computeSeq(60_000)).toBe(1);
    // Arbitrary timestamp
    const t = 1735689600000; // example epoch ms
    expect(computeSeq(t)).toBe(Math.floor(t / 60000));
  });

  it("toFlatBar produces the correct ringBuffer shape", () => {
    const flat = toFlatBar("AAPL", "1m", {
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 12345,
      bar_start: 1_700_000_000_000,
      bar_end: 1_700_000_060_000,
    }, 28333333);

    expect(flat).toEqual({
      symbol: "AAPL",
      timestamp: 1_700_000_000_000,
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 12345,
      seq: 28333333,
      bar_start: 1_700_000_000_000,
      bar_end: 1_700_000_060_000,
      timeframe: "1m",
    });
  });
});
