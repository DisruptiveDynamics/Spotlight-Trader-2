import { eventBus, type Tick, type Microbar, type Bar } from './eventBus';

interface BarState {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SymbolState {
  currentBar: BarState | null;
  bar_start: number;
  bar_end: number;
  microbars: Microbar[];
  lastTickTs: number;
}

export class BarBuilder {
  private states = new Map<string, SymbolState>();
  private microbarInterval = 250;
  private microbarTimers = new Map<string, NodeJS.Timeout>();

  subscribe(symbol: string) {
    if (this.states.has(symbol)) return;

    const now = Date.now();
    const bar_start = Math.floor(now / 60000) * 60000;
    const bar_end = bar_start + 60000;

    this.states.set(symbol, {
      currentBar: null,
      bar_start,
      bar_end,
      microbars: [],
      lastTickTs: now,
    });

    eventBus.on(`tick:${symbol}` as const, (tick) => this.handleTick(symbol, tick));
    this.startMicrobarTimer(symbol);
  }

  unsubscribe(symbol: string) {
    this.states.delete(symbol);
    const timer = this.microbarTimers.get(symbol);
    if (timer) {
      clearInterval(timer);
      this.microbarTimers.delete(symbol);
    }
  }

  private handleTick(symbol: string, tick: Tick) {
    const state = this.states.get(symbol);
    if (!state) return;

    state.lastTickTs = tick.ts;

    const tickMinute = Math.floor(tick.ts / 60000) * 60000;

    if (tick.ts >= state.bar_end) {
      this.finalizeBar(symbol, state);

      state.bar_start = tickMinute;
      state.bar_end = tickMinute + 60000;
      state.currentBar = null;
    }

    if (!state.currentBar) {
      state.currentBar = {
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.size,
      };
    } else {
      state.currentBar.high = Math.max(state.currentBar.high, tick.price);
      state.currentBar.low = Math.min(state.currentBar.low, tick.price);
      state.currentBar.close = tick.price;
      state.currentBar.volume += tick.size;
    }
  }

  private finalizeBar(symbol: string, state: SymbolState) {
    if (!state.currentBar) return;

    const seq = Math.floor(state.bar_start / 60000);

    const finalizedBar: Bar = {
      symbol,
      timeframe: '1m',
      seq,
      bar_start: state.bar_start,
      bar_end: state.bar_end,
      open: state.currentBar.open,
      high: state.currentBar.high,
      low: state.currentBar.low,
      close: state.currentBar.close,
      volume: state.currentBar.volume,
    };

    eventBus.emit(`bar:new:${symbol}:1m` as const, finalizedBar);
  }

  private startMicrobarTimer(symbol: string) {
    const timer = setInterval(() => {
      const state = this.states.get(symbol);
      if (!state || !state.currentBar) return;

      const microbar: Microbar = {
        symbol,
        tf: '250ms',
        ts: Date.now(),
        open: state.currentBar.open,
        high: state.currentBar.high,
        low: state.currentBar.low,
        close: state.currentBar.close,
        volume: state.currentBar.volume,
      };

      eventBus.emit(`microbar:${symbol}` as const, microbar);
    }, this.microbarInterval);

    this.microbarTimers.set(symbol, timer);
  }

  getState(symbol: string): SymbolState | undefined {
    return this.states.get(symbol);
  }
}

export const barBuilder = new BarBuilder();
