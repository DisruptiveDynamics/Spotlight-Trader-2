import type { Request, Response } from 'express';
import { eventBus } from '@server/market/eventBus';
import { getHistory } from '@server/history/service';

export async function sseMarketStream(req: Request, res: Response) {
  const symbolsParam = (req.query.symbols as string) || 'SPY';
  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
  const sinceSeq = req.query.sinceSeq ? parseInt(req.query.sinceSeq as string, 10) : undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (sinceSeq !== undefined) {
    for (const symbol of symbols) {
      const backfill = await getHistory({ symbol, sinceSeq });
      for (const bar of backfill) {
        res.write(`id: ${bar.seq}\n`);
        res.write(`event: bar\n`);
        res.write(
          `data: ${JSON.stringify({
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
          })}\n\n`
        );
      }
    }
  }

  const listeners: Array<{ event: string; handler: (data: any) => void }> = [];

  for (const symbol of symbols) {
    const microbarHandler = (data: any) => {
      res.write(`event: microbar\n`);
      res.write(
        `data: ${JSON.stringify({
          symbol: data.symbol,
          ts: data.ts,
          ohlcv: {
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume,
          },
        })}\n\n`
      );
    };

    const barHandler = (data: any) => {
      res.write(`id: ${data.seq}\n`);
      res.write(`event: bar\n`);
      res.write(
        `data: ${JSON.stringify({
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
        })}\n\n`
      );
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
  });
}
