import { describe, it, expect, beforeEach } from "vitest";
import { BarBuilder } from "../market/barBuilder";
import { eventBus } from "../market/eventBus";

describe("BarBuilder", () => {
  let builder: BarBuilder;

  beforeEach(() => {
    builder = new BarBuilder();
  });

  it("should never mutate finalized bars", () => {
    const symbol = "TEST";
    builder.subscribe(symbol);

    const bars: any[] = [];
    eventBus.on(`bar:new:${symbol}:1m` as const, (bar) => {
      bars.push({ ...bar });
    });

    const baseTime = Math.floor(Date.now() / 60000) * 60000;

    eventBus.emit(`tick:${symbol}` as const, {
      ts: baseTime + 1000,
      price: 100,
      size: 10,
    });

    eventBus.emit(`tick:${symbol}` as const, {
      ts: baseTime + 61000,
      price: 101,
      size: 5,
    });

    expect(bars.length).toBe(1);
    const firstBar = bars[0];
    expect(firstBar?.open).toBe(100);
    expect(firstBar?.close).toBe(100);
    expect(firstBar?.volume).toBe(10);

    eventBus.emit(`tick:${symbol}` as const, {
      ts: baseTime + 62000,
      price: 102,
      size: 7,
    });

    expect(bars[0]).toEqual(firstBar);
  });

  it("should maintain strictly increasing seq", () => {
    const symbol = "TEST";
    builder.subscribe(symbol);

    const seqs: number[] = [];
    eventBus.on(`bar:new:${symbol}:1m` as const, (bar) => {
      seqs.push(bar.seq);
    });

    const baseTime = Math.floor(Date.now() / 60000) * 60000;

    for (let i = 0; i < 5; i++) {
      eventBus.emit(`tick:${symbol}` as const, {
        ts: baseTime + i * 61000,
        price: 100 + i,
        size: 10,
      });
    }

    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
    }
  });

  it("should handle minute boundary correctly", () => {
    const symbol = "TEST";
    builder.subscribe(symbol);

    const bars: any[] = [];
    eventBus.on(`bar:new:${symbol}:1m` as const, (bar) => {
      bars.push(bar);
    });

    const minuteStart = Math.floor(Date.now() / 60000) * 60000;

    eventBus.emit(`tick:${symbol}` as const, {
      ts: minuteStart + 59000,
      price: 100,
      size: 10,
    });

    eventBus.emit(`tick:${symbol}` as const, {
      ts: minuteStart + 60000,
      price: 101,
      size: 5,
    });

    expect(bars.length).toBe(1);
    expect(bars[0]?.bar_start).toBe(minuteStart);
    expect(bars[0]?.bar_end).toBe(minuteStart + 60000);

    const state = builder.getState(symbol);
    expect(state?.currentBar).not.toBeNull();
    expect(state?.bar_start).toBe(minuteStart + 60000);
  });
});
