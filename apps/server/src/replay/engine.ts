import { eventBus, type Microbar, type MarketBarEvent } from "@server/market/eventBus";
import type { Bar } from "@shared/types";
import { getHistory } from "@server/history/service";
import type { Timeframe } from "@server/market/eventBus";

type ReplayState = {
  timer?: NodeJS.Timeout;
  idx: number;
  bars: Bar[];
  speed: number; // 1.0x, 2.0x, etc.
  symbol: string;
  timeframe: Timeframe;
};

const sessions = new Map<string, ReplayState>(); // key per symbol

export async function startReplay(
  symbol: string,
  fromMs: number,
  toMs: number,
  speed = 1.0
) {
  const timeframeMs = 60_000; // 1m bars
  const bars = await getHistory({
    symbol,
    timeframe: "1m",
    limit: Math.ceil((toMs - fromMs) / timeframeMs),
    before: toMs,
  });

  if (!bars.length) {
    throw new Error(`No bars to replay for ${symbol}`);
  }

  const state: ReplayState = {
    idx: 0,
    bars,
    speed,
    symbol,
    timeframe: "1m",
  };
  sessions.set(symbol, state);

  console.log(
    `🎬 Starting replay for ${symbol}: ${bars.length} bars at ${speed}x speed`
  );

  tick(symbol);
  return { total: bars.length };
}

export function stopReplay(symbol: string) {
  const s = sessions.get(symbol);
  if (s?.timer) clearTimeout(s.timer);
  sessions.delete(symbol);
  console.log(`⏹️ Stopped replay for ${symbol}`);
}

export function setReplaySpeed(symbol: string, speed: number) {
  const s = sessions.get(symbol);
  if (s) {
    s.speed = speed;
    console.log(`⏩ Replay speed for ${symbol}: ${speed}x`);
  }
}

function tick(symbol: string) {
  const s = sessions.get(symbol);
  if (!s) return;

  const bar = s.bars[s.idx];
  if (!bar) {
    console.log(`🎬 Replay finished for ${symbol}`);
    stopReplay(symbol);
    return;
  }

  // Emit the closed bar immediately (replay is bar-by-bar)
  // Convert Bar format to MarketBarEvent format expected by eventBus
  const marketBar: MarketBarEvent = {
    symbol: bar.symbol,
    timeframe: s.timeframe,
    seq: bar.seq,
    bar_start: bar.bar_start,
    bar_end: bar.bar_end,
    ohlcv: {
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
    },
  };

  // TypeScript can't infer template literal pattern with runtime values
  // @ts-expect-error - marketBar is correctly typed as MarketBarEvent
  eventBus.emit(`bar:new:${symbol}:${s.timeframe}` as any, marketBar);

  // Optional: synthesize microbar animation between bars for smoother UX
  emitMicrobarPulse(symbol, marketBar);

  s.idx += 1;
  const intervalMs = Math.max(100, 60_000 / s.speed); // accelerate minute to 100ms+ if desired
  s.timer = setTimeout(() => tick(symbol), intervalMs);
}

function emitMicrobarPulse(symbol: string, bar: any) {
  // Simple 3-step pulse: open -> mid -> close
  const steps = [
    {
      o: bar.ohlcv.o,
      h: Math.max(bar.ohlcv.o, bar.ohlcv.c, bar.ohlcv.h),
      l: Math.min(bar.ohlcv.o, bar.ohlcv.c, bar.ohlcv.l),
      c: (bar.ohlcv.o + bar.ohlcv.c) / 2,
      v: Math.floor((bar.ohlcv.v ?? 0) * 0.5),
    },
    {
      o: bar.ohlcv.o,
      h: bar.ohlcv.h,
      l: bar.ohlcv.l,
      c: bar.ohlcv.c,
      v: bar.ohlcv.v ?? 0,
    },
  ];

  let i = 0;
  const pulse = setInterval(() => {
    const step = steps[i++];
    if (!step) return clearInterval(pulse);

    const microbar: Microbar = {
      symbol,
      tf: "250ms",
      ts: Date.now(),
      open: step.o,
      high: step.h,
      low: step.l,
      close: step.c,
      volume: step.v,
    };

    eventBus.emit(`microbar:${symbol}` as const, microbar);
  }, 120);
}
