import { describe, it, expect, vi } from "vitest";

import { ensureFreshTools } from "../guards/freshnessGuard";
import { enforceRealtimeClaim } from "../guards/noDataGuard";

describe("noDataGuard", () => {
  it("forces snapshot when draft denies realtime data", async () => {
    const callTool = vi.fn().mockResolvedValue({ regime: "trend-up", volumeFactor: 1.4 });
    const out = await enforceRealtimeClaim(
      "I don't have real-time data",
      "NVDA",
      callTool,
      "1m",
      50,
    );
    expect(callTool).toHaveBeenCalledWith("get_chart_snapshot", {
      symbol: "NVDA",
      timeframe: "1m",
      barCount: 50,
    });
    expect(out).toMatch(/Live check OK/);
  });
  it("passes through when draft is fine", async () => {
    const callTool = vi.fn();
    const out = await enforceRealtimeClaim("NVDA A+ entry 117.42", "NVDA", callTool as any);
    expect(callTool).not.toHaveBeenCalled();
    expect(out).toContain("NVDA A+");
  });
});

describe("freshnessGuard", () => {
  it("calls snapshot and rules when stale", async () => {
    const cache = new Map();
    const callTool = vi.fn().mockResolvedValue({});
    await ensureFreshTools("NVDA", "1m", callTool, cache, () => 10000, 5000, 7000);
    expect(callTool).toHaveBeenCalledWith("get_chart_snapshot", {
      symbol: "NVDA",
      timeframe: "1m",
      barCount: 50,
    });
    expect(callTool).toHaveBeenCalledWith("evaluate_rules", { symbol: "NVDA", timeframe: "1m" });
  });
});
