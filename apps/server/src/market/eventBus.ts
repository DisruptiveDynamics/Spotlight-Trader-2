import { EventEmitter } from "events";

export interface Tick {
  ts: number;
  price: number;
  size: number;
  side?: "buy" | "sell";
}

export interface Microbar {
  symbol: string;
  tf: "250ms";
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "2m" | "5m" | "10m" | "15m" | "30m" | "1h";

export interface Bar {
  symbol: string;
  timeframe: Timeframe;
  seq: number;
  bar_start: number;
  bar_end: number;
  ohlcv: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  };
}

import type { EvaluatedRule, Signal } from "@shared/types/rules";

type EventMap = {
  [key: `tick:${string}`]: Tick;
  [key: `microbar:${string}`]: Microbar;
  [key: `bar:new:${string}:${Timeframe}`]: Bar;
  "rule:evaluated": EvaluatedRule;
  "signal:new": Signal;
  "signal:approved": Signal;
};

class TypedEventBus extends EventEmitter {
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    return super.emit(event as string, data);
  }

  on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.on(event as string, listener);
  }

  once<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.once(event as string, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.off(event as string, listener);
  }
}

export const eventBus = new TypedEventBus();
eventBus.setMaxListeners(1000);
