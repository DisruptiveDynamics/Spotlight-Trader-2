import { Request, Response, NextFunction } from "express";

import { verifyJwt, JwtPayload } from "../auth/jwt.js";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function requireUser(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const token = req.cookies?.sid || req.headers.authorization?.replace("Bearer ", "");

    console.log(
      "[AUTH] requireUser middleware - cookies:",
      req.cookies,
      "hasAuth:",
      !!req.headers.authorization,
      "token:",
      token ? "present" : "missing",
    );

    if (!token) {
      console.warn("[AUTH] No authentication token found");
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const payload = verifyJwt(token);

    if (!payload) {
      console.warn("[AUTH] Invalid or expired JWT token");
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    console.log("[AUTH] User authenticated:", payload.userId);
    req.user = payload;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
}
