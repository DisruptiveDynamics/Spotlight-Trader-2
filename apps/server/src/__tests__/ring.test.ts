import type { Bar } from "@shared/types";
import { describe, it, expect, beforeEach } from "vitest";

import { RingBuffer } from "../cache/ring";

describe("RingBuffer", () => {
  let ring: RingBuffer;

  beforeEach(() => {
    ring = new RingBuffer();
  });

  it("should return correct slice with getSinceSeq", () => {
    const symbol = "TEST";
    const bars: Bar[] = [
      {
    timestamp: 1000,
        symbol,
        seq: 1,
        bar_start: 1000,
        bar_end: 2000,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000,
      },
      {
    timestamp: 1000,
        symbol,
        seq: 2,
        bar_start: 2000,
        bar_end: 3000,
        open: 100.5,
        high: 102,
        low: 100,
        close: 101,
        volume: 1500,
      },
      {
    timestamp: 1000,
        symbol,
        seq: 3,
        bar_start: 3000,
        bar_end: 4000,
        open: 101,
        high: 103,
        low: 101,
        close: 102,
        volume: 2000,
      },
    ];

    ring.putBars(symbol, bars);

    const result = ring.getSinceSeq(symbol, 1);
    expect(result.length).toBe(2);
    expect(result[0]?.seq).toBe(2);
    expect(result[1]?.seq).toBe(3);
  });

  it("should limit buffer size to maxSize", () => {
    const symbol = "TEST";
    const bars: Bar[] = [];

    for (let i = 0; i < 6000; i++) {
      bars.push({
        symbol,
        timestamp: 0,
        seq: i,
        bar_start: i * 60000,
        bar_end: (i + 1) * 60000,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000,
      });
    }

    ring.putBars(symbol, bars);

    const recent = ring.getRecent(symbol, 10000);
    expect(recent.length).toBe(5000);
    expect(recent[0]?.seq).toBe(1000);
  });

  it("should return empty array for unknown symbol", () => {
    const result = ring.getSinceSeq("UNKNOWN", 0);
    expect(result).toEqual([]);
  });
});
