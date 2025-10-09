import { Router } from 'express';
import { z } from 'zod';
import { runBacktest, getBacktestPresets } from '../backtest/engine';
import { ruleRegistry } from '../rules/registry';
import { isEnabled } from '../flags';

export const backtestRouter: Router = Router();

const BacktestSchema = z.object({
  symbol: z.string(),
  timeframe: z.enum(['1m', '5m', '15m', '1h', 'D']),
  start: z.string(),
  end: z.string(),
  ruleIds: z.array(z.string()),
});

/**
 * POST /api/backtest/run
 * Run a backtest with specified parameters
 */
backtestRouter.post('/run', async (req, res) => {
  if (!isEnabled('enableBacktest')) {
    return res.status(403).json({ error: 'Backtest feature is disabled' });
  }

  try {
    const parsed = BacktestSchema.parse(req.body);
    const userId = 'demo-user'; // TODO: Get from auth

    // Fetch rules
    const rules = await Promise.all(
      parsed.ruleIds.map((id) => ruleRegistry.getRule(userId, id))
    );

    const validRules = rules.filter((r) => r !== null);

    if (validRules.length === 0) {
      return res.status(400).json({ error: 'No valid rules found' });
    }

    const result = await runBacktest({
      symbol: parsed.symbol,
      timeframe: parsed.timeframe,
      start: parsed.start,
      end: parsed.end,
      rules: validRules,
    });

    res.json(result);
  } catch (error) {
    console.error('Backtest error:', error);
    res.status(500).json({ error: 'Backtest failed' });
  }
});

/**
 * GET /api/backtest/presets
 * Get common backtest presets
 */
backtestRouter.get('/presets', (_req, res) => {
  const presets = getBacktestPresets();
  res.json({ presets });
});
