import { Router } from 'express';
import { z } from 'zod';
import { saveFeedback, getRuleMetrics } from '../learning/loop';

export const feedbackRouter: Router = Router();

const FeedbackSchema = z.object({
  symbol: z.string(),
  seq: z.number(),
  ruleId: z.string(),
  label: z.enum(['good', 'bad', 'missed', 'late']),
  notes: z.string().optional(),
});

/**
 * POST /api/feedback
 * Submit feedback for a signal
 */
feedbackRouter.post('/', async (req, res) => {
  try {
    const parsed = FeedbackSchema.parse(req.body);
    const userId = 'demo-user'; // TODO: Get from auth

    await saveFeedback({
      userId,
      symbol: parsed.symbol,
      seq: parsed.seq,
      ruleId: parsed.ruleId,
      label: parsed.label,
      notes: parsed.notes || null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(400).json({ error: 'Invalid feedback' });
  }
});

/**
 * GET /api/rules/metrics?ruleId=...
 * Get aggregated metrics and score for a rule
 */
feedbackRouter.get('/rules/metrics', async (req, res) => {
  try {
    const ruleId = req.query.ruleId as string;
    if (!ruleId) {
      return res.status(400).json({ error: 'Missing ruleId' });
    }

    const userId = 'demo-user'; // TODO: Get from auth
    const metrics = await getRuleMetrics(userId, ruleId);

    res.json({ metrics });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});
