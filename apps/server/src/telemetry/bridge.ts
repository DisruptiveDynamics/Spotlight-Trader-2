import { eventBus, type Bar, type Tick } from '@server/market/eventBus';
import { telemetryBus } from './bus';

export function initializeTelemetryBridge(): void {
  eventBus.on('bar:new:SPY:1m', (bar: Bar) => {
    telemetryBus.publish({
      type: 'bar:new',
      symbol: bar.symbol,
      timeframe: bar.timeframe,
      timestamp: bar.bar_start,
      data: { bar },
    });
  });

  eventBus.on('bar:new:QQQ:1m', (bar: Bar) => {
    telemetryBus.publish({
      type: 'bar:new',
      symbol: bar.symbol,
      timeframe: bar.timeframe,
      timestamp: bar.bar_start,
      data: { bar },
    });
  });

  eventBus.on('tick:SPY', (tick: Tick) => {
    telemetryBus.publish({
      type: 'tick',
      symbol: 'SPY',
      timeframe: '1m',
      timestamp: tick.ts,
      data: {
        price: tick.price,
        size: tick.size,
      },
    });
  });

  eventBus.on('tick:QQQ', (tick: Tick) => {
    telemetryBus.publish({
      type: 'tick',
      symbol: 'QQQ',
      timeframe: '1m',
      timestamp: tick.ts,
      data: {
        price: tick.price,
        size: tick.size,
      },
    });
  });

  console.log('✅ Telemetry bridge initialized');
}
