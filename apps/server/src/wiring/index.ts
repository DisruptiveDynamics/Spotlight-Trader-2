import type { Express } from 'express';
import { polygonWs } from '@server/market/polygonWs';
import { barBuilder } from '@server/market/barBuilder';
import { sseMarketStream } from '@server/stream/sse';
import { getHistory } from '@server/history/service';
import { rulesEngineService } from '@server/rules/service';
import { signalsService } from '@server/signals/service';
import { coachAdvisor } from '@server/coach/advisor';
import { getMarketSource, getMarketReason } from '@server/market/bootstrap';
import { isRthOpen } from '@server/market/session';

const DEFAULT_FAVORITES = ['SPY', 'QQQ'];
const DEFAULT_TIMEFRAME = '1m';

// Track active timeframe subscriptions per symbol
const activeSubscriptions = new Map<string, string>();

function subscribeSymbolTimeframe(symbol: string, timeframe: string) {
  // Unsubscribe from old timeframe if exists
  const oldTimeframe = activeSubscriptions.get(symbol);
  if (oldTimeframe) {
    barBuilder.unsubscribe(symbol, oldTimeframe);
  }

  // Subscribe to new timeframe
  // NOTE: barBuilder.finalizeBar() now writes directly to ringBuffer,
  // so we don't need a separate event listener here (avoids double-writes)
  barBuilder.subscribe(symbol, timeframe);

  activeSubscriptions.set(symbol, timeframe);
  console.log(`📊 Subscribed ${symbol} to ${timeframe} timeframe`);
}

export function initializeMarketPipeline(app: Express) {
  polygonWs.connect();

  rulesEngineService.start();
  signalsService.start();
  coachAdvisor.start();

  for (const symbol of DEFAULT_FAVORITES) {
    polygonWs.subscribe(symbol);
    subscribeSymbolTimeframe(symbol, DEFAULT_TIMEFRAME);
  }

  app.get('/api/history', async (req, res) => {
    const { symbol, timeframe = '1m', limit = 1000, before, sinceSeq } = req.query;
    
    try {
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: 'symbol is required' });
      }

      // Validate timeframe
      const validTimeframes = ['1m', '2m', '5m', '10m', '15m', '30m', '1h'];
      if (typeof timeframe === 'string' && !validTimeframes.includes(timeframe)) {
        return res.status(400).json({ error: 'Invalid timeframe' });
      }

      const query: any = {
        symbol: symbol.toUpperCase(),
        timeframe: (typeof timeframe === 'string' ? timeframe : '1m'),
        limit: limit ? parseInt(limit as string, 10) : 1000,
      };
      
      if (before) {
        query.before = parseInt(before as string, 10);
      }
      
      if (sinceSeq) {
        query.sinceSeq = parseInt(sinceSeq as string, 10);
      }
      
      const bars = await getHistory(query);

      // Defensive guard: always return array (never undefined/null)
      if (!Array.isArray(bars)) {
        console.error('[History API] getHistory returned non-array:', typeof bars, 'for symbol:', symbol.toUpperCase());
        return res.json([]);
      }

      // Bars already have nested ohlcv format, just return them
      res.json(bars);
    } catch (err) {
      console.error('[History API] Error fetching bars:', {
        symbol: typeof symbol === 'string' ? symbol.toUpperCase() : 'unknown',
        timeframe: typeof timeframe === 'string' ? timeframe : '1m',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      // Always return empty array on error (never throw to client)
      res.status(500).json([]);
    }
  });

  app.get('/stream/market', sseMarketStream);

  // Endpoint to change timeframe for a symbol
  app.post('/api/chart/timeframe', (req, res) => {
    try {
      const { symbol, timeframe } = req.body;

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: 'symbol is required' });
      }

      const validTimeframes = ['1m', '2m', '5m', '10m', '15m', '30m', '1h'];
      if (!timeframe || !validTimeframes.includes(timeframe)) {
        return res.status(400).json({ error: 'Invalid timeframe' });
      }

      subscribeSymbolTimeframe(symbol.toUpperCase(), timeframe);

      res.json({ 
        success: true, 
        symbol: symbol.toUpperCase(), 
        timeframe,
        message: `Switched to ${timeframe} timeframe for ${symbol}`
      });
    } catch (err) {
      console.error('Timeframe change error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/market/status', (_req, res) => {
    const source = getMarketSource();
    const reason = getMarketReason();
    const sessionStatus = isRthOpen();
    
    res.setHeader('X-Market-Source', source);
    res.setHeader('X-Market-Reason', reason);
    res.setHeader('X-Market-Session', sessionStatus.session);
    res.setHeader('X-Market-Open', String(sessionStatus.open));
    
    res.json({ 
      source, 
      reason,
      session: sessionStatus.session,
      open: sessionStatus.open
    });
  });

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
