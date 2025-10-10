import { Router, type RequestHandler } from 'express';
import { requireAdmin } from '../middleware/requireAdmin';
import { metrics } from '../metrics/registry';
import { getFlags } from '../flags/store';

const router: Router = Router();

router.get('/snapshot', requireAdmin, (async (req, res) => {
  try {
    const metricsData = metrics.getMetrics();
    const flags = getFlags();
    
    const snapshot = {
      timestamp: Date.now(),
      metrics: metricsData,
      flags,
      system: {
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        arch: process.arch,
      },
    };
    
    res.json(snapshot);
  } catch (error) {
    console.error('Error generating snapshot:', error);
    res.status(500).json({ error: 'Failed to generate snapshot' });
  }
}) as RequestHandler);

export { router as adminRouter };
