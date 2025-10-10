import type { Request, Response } from 'express';
import { eventBus } from '@server/market/eventBus';
import { getHistory } from '@server/history/service';
import { BackpressureController } from './backpressure';

export async function sseMarketStream(req: Request, res: Response) {
  const symbolsParam = (req.query.symbols as string) || 'SPY';
  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
  const sinceSeq = req.query.sinceSeq ? parseInt(req.query.sinceSeq as string, 10) : undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const bpc = new BackpressureController(res, 100);

  if (sinceSeq !== undefined) {
    for (const symbol of symbols) {
      const backfill = await getHistory({ symbol, sinceSeq });
      for (const bar of backfill) {
        bpc.write('bar', {
          symbol: bar.symbol,
          timeframe: bar.timeframe,
          seq: bar.seq,
          bar_start: bar.bar_start,
          bar_end: bar.bar_end,
          ohlcv: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          },
        }, String(bar.seq));
      }
    }
  }

  const listeners: Array<{ event: string; handler: (data: any) => void }> = [];

  const alertHandler = (signal: any) => {
    bpc.write('alert', {
      id: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      confidence: signal.confidence,
      timestamp: signal.ts,
    });
  };

  eventBus.on('signal:new', alertHandler);
  listeners.push({ event: 'signal:new', handler: alertHandler });

  for (const symbol of symbols) {
    const microbarHandler = (data: any) => {
      bpc.write('microbar', {
        symbol: data.symbol,
        ts: data.ts,
        ohlcv: {
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volume,
        },
      });
    };

    const barHandler = (data: any) => {
      bpc.write('bar', {
        symbol: data.symbol,
        timeframe: data.timeframe,
        seq: data.seq,
        bar_start: data.bar_start,
        bar_end: data.bar_end,
        ohlcv: {
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volume,
        },
      }, String(data.seq));
    };

    eventBus.on(`microbar:${symbol}` as const, microbarHandler);
    eventBus.on(`bar:new:${symbol}:1m` as const, barHandler);

    listeners.push(
      { event: `microbar:${symbol}`, handler: microbarHandler },
      { event: `bar:new:${symbol}:1m`, handler: barHandler }
    );
  }

  const heartbeat = setInterval(() => {
    res.write(':\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    listeners.forEach(({ event, handler }) => {
      eventBus.off(event as any, handler);
    });
    bpc.destroy();
  });
}
