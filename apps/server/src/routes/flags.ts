import { Router, Response } from 'express';
import { getFlags, updateFlags } from '../flags/store';
import { requireUser } from '../middleware/requireUser';
import { requireAdmin, AuthenticatedRequest } from '../middleware/requireAdmin';

export const flagsRouter: Router = Router();

/**
 * GET /api/flags
 * Returns all feature flags and their current states
 */
flagsRouter.get('/', (_req, res) => {
  const flags = getFlags();
  res.json(flags);
});

/**
 * POST /api/flags
 * Update feature flags (admin only)
 */
flagsRouter.post(
  '/',
  requireUser,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const patch = req.body;
      const updatedFlags = await updateFlags(patch);

      res.json({
        success: true,
        flags: updatedFlags,
      });
    } catch (error) {
      console.error('Failed to update flags:', error);
      res.status(500).json({ error: 'Failed to update flags' });
    }
  }
);
