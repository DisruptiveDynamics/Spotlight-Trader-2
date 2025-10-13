/**
 * Admin middleware
 * Protects admin-only routes
 */

import { Request, Response, NextFunction } from "express";
import { validateEnv } from "@shared/env";

const env = validateEnv(process.env);

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

/**
 * Middleware to require admin access
 * Checks if user email matches ADMIN_EMAIL environment variable
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const adminEmail = env.ADMIN_EMAIL;

  if (!adminEmail) {
    return res.status(500).json({
      error: "Admin access not configured. Set ADMIN_EMAIL environment variable.",
    });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.email !== adminEmail) {
    return res.status(403).json({
      error: "Admin access required",
      message: "You do not have permission to access this resource",
    });
  }

  next();
}
