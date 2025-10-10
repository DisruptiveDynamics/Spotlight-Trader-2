import { Response, NextFunction } from 'express';
import { AuthRequest } from './requireUser.js';

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitWindow>();

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitOptions> = {
  '/api/insight/explain': { windowMs: 10000, maxRequests: 2 },
  '/api/backtest/run': { windowMs: 10000, maxRequests: 1 },
  '/api/memory': { windowMs: 10000, maxRequests: 5 },
};

export function rateLimit(options?: RateLimitOptions) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required for rate limiting' });
      return;
    }

    const limit = options || DEFAULT_LIMITS[req.path] || { windowMs: 10000, maxRequests: 10 };
    const key = `${userId}:${req.path}`;
    const now = Date.now();

    let window = rateLimits.get(key);

    if (!window || now > window.resetAt) {
      window = {
        count: 0,
        resetAt: now + limit.windowMs,
      };
      rateLimits.set(key, window);
    }

    window.count++;

    if (window.count > limit.maxRequests) {
      const retryAfter = Math.ceil((window.resetAt - now) / 1000);
      res.set('Retry-After', retryAfter.toString());
      res.status(429).json({
        error: 'Too many requests',
        retryAfter,
      });
      return;
    }

    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, window] of rateLimits.entries()) {
    if (now > window.resetAt) {
      rateLimits.delete(key);
    }
  }
}, 60000);
