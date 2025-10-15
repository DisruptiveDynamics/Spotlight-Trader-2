import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { clearAuthCookie, setAuthCookie, signPinToken } from "../middleware/requirePin";

export const pinAuthRouter: ExpressRouter = Router();

pinAuthRouter.post("/pin", (req, res) => {
  const bodyPin = String(req.body?.pin || "");
  const appPin = String(process.env.APP_PIN || "");

  if (!appPin) {
    return res.status(500).json({ ok: false, error: "APP_PIN not configured on server" });
  }
  if (!/^\d{6}$/.test(bodyPin)) {
    return res.status(400).json({ ok: false, error: "PIN must be 6 digits" });
  }
  if (bodyPin !== appPin) {
    return res.status(401).json({ ok: false, error: "Invalid PIN" });
  }

  const token = signPinToken("owner");
  setAuthCookie(res, token);
  res.json({ ok: true });
});

pinAuthRouter.get("/status", (req, res) => {
  try {
    const cookie = req.cookies?.["st_auth"];
    if (!cookie) {
      return res.status(401).json({ ok: false });
    }
    res.json({ ok: true });
  } catch {
    res.status(401).json({ ok: false });
  }
});

pinAuthRouter.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});
