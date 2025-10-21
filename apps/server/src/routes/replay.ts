import { Router } from "express";
import { startReplay, stopReplay, setReplaySpeed } from "@server/replay/engine";

const router: Router = Router();

router.post("/start", async (req, res) => {
  // [FF_REPLAY] OnDemand replay is a dev/test tool - gate behind feature flag
  if (process.env.FF_REPLAY !== "on") {
    return res.status(403).json({ 
      ok: false, 
      error: "Replay mode disabled. Set FF_REPLAY=on to enable (dev/test only)" 
    });
  }

  try {
    const { symbol, fromMs, toMs, speed } = req.body ?? {};
    
    if (!symbol) {
      return res.status(400).json({ ok: false, error: "symbol required" });
    }
    
    const result = await startReplay(
      String(symbol),
      Number(fromMs) || Date.now() - 24 * 60 * 60 * 1000, // default: 24h ago
      Number(toMs) || Date.now(),
      Number(speed) || 1.0
    );
    
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "failed";
    res.status(400).json({ ok: false, error });
  }
});

router.post("/stop", (req, res) => {
  const { symbol } = req.body ?? {};
  
  if (!symbol) {
    return res.status(400).json({ ok: false, error: "symbol required" });
  }
  
  stopReplay(String(symbol));
  res.json({ ok: true });
});

router.post("/speed", (req, res) => {
  const { symbol, speed } = req.body ?? {};
  
  if (!symbol || !speed) {
    return res.status(400).json({ ok: false, error: "symbol and speed required" });
  }
  
  setReplaySpeed(String(symbol), Number(speed) || 1.0);
  res.json({ ok: true });
});

export default router;
