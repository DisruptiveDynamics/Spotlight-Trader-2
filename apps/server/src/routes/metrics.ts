import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { recordWebVital, recordFPS } from '../metrics/registry';

const router: Router = Router();

const webVitalsSchema = z.object({
  name: z.enum(['CLS', 'FID', 'FCP', 'LCP', 'TTFB', 'INP']),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
});

const fpsSchema = z.object({
  fps: z.number().min(0).max(144),
});

router.post('/vitals', async (req, res) => {
  try {
    const parsed = webVitalsSchema.parse(req.body);
    recordWebVital(parsed.name, parsed.value, parsed.rating || 'unknown');
    res.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/fps', async (req, res) => {
  try {
    const parsed = fpsSchema.parse(req.body);
    recordFPS(parsed.fps);
    res.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export { router as metricsRouter };
