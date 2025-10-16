import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const COOKIE_NAME = "st_auth";

const APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "dev_secret_change_me";

export interface PinAuthPayload {
  sub: string;
  typ: "pin";
}

export function signPinToken(userId = "owner", maxAgeSec = 60 * 60 * 24 * 30) {
  return jwt.sign({ sub: userId, typ: "pin" } as PinAuthPayload, APP_AUTH_SECRET, {
    expiresIn: maxAgeSec,
  });
}

export function requirePin(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    const decoded = jwt.verify(raw, APP_AUTH_SECRET) as PinAuthPayload;
    if (!decoded || decoded.typ !== "pin") {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    (req as any).userId = decoded.sub;
    next();
  } catch (_err) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

export function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
