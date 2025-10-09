import { EventEmitter } from 'events';

export interface Tick {
  ts: number;
  price: number;
  size: number;
  side?: 'buy' | 'sell';
}

export interface Microbar {
  symbol: string;
  tf: '250ms';
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Bar {
  symbol: string;
  timeframe: '1m';
  seq: number;
  bar_start: number;
  bar_end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type EventMap = {
  [key: `tick:${string}`]: Tick;
  [key: `microbar:${string}`]: Microbar;
  [key: `bar:new:${string}:1m`]: Bar;
};

class TypedEventBus extends EventEmitter {
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    return super.emit(event as string, data);
  }

  on<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ): this {
    return super.on(event as string, listener);
  }

  once<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ): this {
    return super.once(event as string, listener);
  }

  off<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ): this {
    return super.off(event as string, listener);
  }
}

export const eventBus = new TypedEventBus();
eventBus.setMaxListeners(1000);
