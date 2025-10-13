import type { Express } from 'express';
import { polygonWs } from '@server/market/polygonWs';
import { barBuilder } from '@server/market/barBuilder';
import { sseMarketStream } from '@server/stream/sse';
import { getHistory } from '@server/history/service';
import { eventBus } from '@server/market/eventBus';
import { ringBuffer } from '@server/cache/ring';
import { bars1m } from '@server/chart/bars1m';
import { sessionVWAP } from '@server/indicators/vwap';
import { rulesEngineService } from '@server/rules/service';
import { signalsService } from '@server/signals/service';
import { coachAdvisor } from '@server/coach/advisor';
import { getMarketSource, getMarketReason } from '@server/market/bootstrap';
import { isRthOpen } from '@server/market/session';

const DEFAULT_FAVORITES = ['SPY', 'QQQ'];
const DEFAULT_TIMEFRAME = '1m';

// Track active timeframe subscriptions per symbol
const activeSubscriptions = new Map<string, string>();
// Track bar listeners to properly remove them
const barListeners = new Map<string, (bar: any) => void>();

function subscribeSymbolTimeframe(symbol: string, timeframe: string) {
  // Unsubscribe from old timeframe if exists
  const oldTimeframe = activeSubscriptions.get(symbol);
  if (oldTimeframe) {
    barBuilder.unsubscribe(symbol, oldTimeframe);
    
    // Remove old bar listener using stored reference
    const oldListener = barListeners.get(symbol);
    if (oldListener) {
      eventBus.off(`bar:new:${symbol}:${oldTimeframe}` as any, oldListener);
    }
  }

  // Subscribe to new timeframe
  barBuilder.subscribe(symbol, timeframe);
  
  // Create and store bar listener reference for proper cleanup
  const barListener = (bar: any) => {
    ringBuffer.putBars(symbol, [bar]);
    
    // Feed 1m bars into authoritative buffer (single source of truth)
    if (timeframe === '1m') {
      bars1m.append(symbol, {
        symbol: bar.symbol,
        seq: bar.seq,
        bar_start: bar.bar_start,
        bar_end: bar.bar_end,
        o: bar.ohlcv.o,
        h: bar.ohlcv.h,
        l: bar.ohlcv.l,
        c: bar.ohlcv.c,
        v: bar.ohlcv.v,
      });
    }
  };
  barListeners.set(symbol, barListener);
  
  // Listen to bar events for this timeframe
  eventBus.on(`bar:new:${symbol}:${timeframe}` as any, barListener);

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
    
    // Subscribe to session VWAP (same tick stream as Tape)
    sessionVWAP.subscribe(symbol);
  }

  app.get('/api/history', async (req, res) => {
    try {
      const { symbol, timeframe = '1m', limit = 1000, before, sinceSeq } = req.query;

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

      // Bars already have nested ohlcv format, just return them
      res.json(bars);
    } catch (err) {
      console.error('History API error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/stream/market', sseMarketStream);

  // Endpoint to change timeframe for a symbol (replaced with new implementation)
  const { handleChartTimeframe } = require('@server/routes/chartTimeframe');
  app.post('/api/chart/timeframe', handleChartTimeframe);

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
