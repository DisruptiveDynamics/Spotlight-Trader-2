import { Router, type Router as ExpressRouter } from 'express';
import { eventBus } from '@server/market/eventBus';
import { ringBuffer } from '@server/cache/ring';
import type { Bar } from '@server/market/eventBus';

const router: ExpressRouter = Router();

router.post('/test/vwap-reclaim', async (req, res) => {
  const now = Date.now();
  const sessionStart = new Date().setHours(9, 30, 0, 0);
  
  const baseBars: Bar[] = [
    {
      symbol: 'SPY',
      timeframe: '1m',
      seq: 100,
      bar_start: now - 300000,
      bar_end: now - 240000,
      ohlcv: { o: 100, h: 101, l: 99, c: 100, v: 100000 },
    },
    {
      symbol: 'SPY',
      timeframe: '1m',
      seq: 101,
      bar_start: now - 240000,
      bar_end: now - 180000,
      ohlcv: { o: 100, h: 100.5, l: 99.5, c: 99.8, v: 120000 },
    },
    {
      symbol: 'SPY',
      timeframe: '1m',
      seq: 102,
      bar_start: now - 180000,
      bar_end: now - 120000,
      ohlcv: { o: 99.8, h: 100.2, l: 99.6, c: 100.1, v: 150000 },
    },
    {
      symbol: 'SPY',
      timeframe: '1m',
      seq: 103,
      bar_start: now - 120000,
      bar_end: now - 60000,
      ohlcv: { o: 100.1, h: 100.3, l: 100, c: 100.2, v: 180000 },
    },
  ];

  ringBuffer.putBars('SPY', baseBars);
  
  for (const bar of baseBars) {
    eventBus.emit('bar:new:SPY:1m', bar);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  res.json({
    success: true,
    message: 'VWAP reclaim test sequence fired',
    bars: baseBars.length,
  });
});

router.post('/test/orb', async (req, res) => {
  const now = Date.now();
  const sessionStart = new Date().setHours(9, 30, 0, 0);

  const orbBars: Bar[] = [
    {
      symbol: 'SPY',
      timeframe: '1m',
      seq: 200,
      bar_start: sessionStart,
      bar_end: sessionStart + 60000,
      ohlcv: { o: 100, h: 100.5, l: 99.8, c: 100.2, v: 200000 },
    },
    {
      symbol: 'SPY',
      timeframe: '1m',
      seq: 201,
      bar_start: sessionStart + 60000,
      bar_end: sessionStart + 120000,
      ohlcv: { o: 100.2, h: 100.6, l: 100, c: 100.3, v: 180000 },
    },
    {
      symbol: 'SPY',
      timeframe: '1m',
      seq: 202,
      bar_start: sessionStart + 120000,
      bar_end: sessionStart + 180000,
      ohlcv: { o: 100.3, h: 101.2, l: 100.3, c: 101, v: 450000 },
    },
  ];

  ringBuffer.putBars('SPY', orbBars);
  
  for (const bar of orbBars) {
    eventBus.emit('bar:new:SPY:1m', bar);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  res.json({
    success: true,
    message: 'ORB breakout test sequence fired',
    bars: orbBars.length,
  });
});

router.post('/test/ema-pullback', async (req, res) => {
  const now = Date.now();
  
  const emaBars: Bar[] = [];
  let basePrice = 100;
  
  for (let i = 0; i < 25; i++) {
    basePrice += (i < 20) ? 0.1 : -0.05;
    const volume = (i >= 20) ? 80000 : 150000;
    
    emaBars.push({
      symbol: 'SPY',
      timeframe: '1m',
      seq: 300 + i,
      bar_start: now - (25 - i) * 60000,
      bar_end: now - (24 - i) * 60000,
      ohlcv: {
        o: basePrice,
        h: basePrice + 0.1,
        l: basePrice - 0.05,
        c: basePrice + 0.05,
        v: volume,
      },
    });
  }

  ringBuffer.putBars('SPY', emaBars);
  
  for (const bar of emaBars) {
    eventBus.emit('bar:new:SPY:1m', bar);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  res.json({
    success: true,
    message: 'EMA pullback test sequence fired',
    bars: emaBars.length,
  });
});

export default router;
