import { Router } from 'express';
import { getAllFlags } from '../flags';

export const flagsRouter: Router = Router();

/**
 * GET /api/flags
 * Returns all feature flags and their current states
 */
flagsRouter.get('/', (_req, res) => {
  res.json({ flags: getAllFlags() });
});
