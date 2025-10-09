import type { Express } from 'express';
import { polygonWs } from '@server/market/polygonWs';
import { barBuilder } from '@server/market/barBuilder';
import { sseMarketStream } from '@server/stream/sse';
import { getHistory } from '@server/history/service';
import { eventBus } from '@server/market/eventBus';
import { ringBuffer } from '@server/cache/ring';
import { rulesEngineService } from '@server/rules/service';
import { signalsService } from '@server/signals/service';
import { coachAdvisor } from '@server/coach/advisor';

const DEFAULT_FAVORITES = ['SPY', 'QQQ'];

export function initializeMarketPipeline(app: Express) {
  polygonWs.connect();

  rulesEngineService.start();
  signalsService.start();
  coachAdvisor.start();

  for (const symbol of DEFAULT_FAVORITES) {
    polygonWs.subscribe(symbol);
    barBuilder.subscribe(symbol);

    eventBus.on(`bar:new:${symbol}:1m` as const, (bar) => {
      ringBuffer.putBars(symbol, [bar]);
    });
  }

  app.get('/api/history', async (req, res) => {
    try {
      const { symbol, timeframe = '1m', limit = 1000, before, sinceSeq } = req.query;

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: 'symbol is required' });
      }

      const query: {
        symbol: string;
        timeframe: '1m';
        limit: number;
        before?: number;
        sinceSeq?: number;
      } = {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe as '1m',
        limit: limit ? parseInt(limit as string, 10) : 1000,
      };

      if (before) {
        query.before = parseInt(before as string, 10);
      }

      if (sinceSeq) {
        query.sinceSeq = parseInt(sinceSeq as string, 10);
      }

      const bars = await getHistory(query);

      res.json(bars);
    } catch (err) {
      console.error('History API error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/stream/market', sseMarketStream);

  app.get('/ready', (_req, res) => {
    const isReady = true;

    if (isReady) {
      res.json({ status: 'ready', timestamp: Date.now() });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  });

  console.log('✅ Market pipeline initialized');
  console.log(`   Subscribed symbols: ${DEFAULT_FAVORITES.join(', ')}`);
  console.log('✅ Rules engine started');
  console.log('✅ Signals service started');
  console.log('✅ Coach advisor started');
}
