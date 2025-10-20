import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { z } from "zod";

import {
  getActiveSymbols,
  isSymbolActive,
  subscribeSymbol,
  unsubscribeSymbol,
} from "@server/market/symbolManager";

const router: ExpressRouter = Router();

// Get list of currently active (subscribed) symbols
router.get("/active", (_req, res) => {
  res.json({ symbols: getActiveSymbols() });
});

// Check if a specific symbol is active
router.get("/status/:symbol", (req, res) => {
  const { symbol } = req.params;
  res.json({ symbol, active: isSymbolActive(symbol) });
});

// Subscribe to a symbol (enables live data feed + seeds history)
router.post("/subscribe", async (req, res) => {
  try {
    const schema = z.object({
      symbol: z.string().regex(/^[A-Z]{1,6}$/i, "Invalid symbol format"),
      seedLimit: z.number().int().min(1).max(500).optional().default(200),
    });

    const { symbol, seedLimit } = schema.parse(req.body);
    const result = await subscribeSymbol(symbol, { seedLimit });

    res.json({ symbol: symbol.toUpperCase(), ...result });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: e.errors });
    }
    console.error("Subscribe error:", e);
    res.status(500).json({ error: e?.message || "Subscription failed" });
  }
});

// Unsubscribe from a symbol (decrements ref count, may auto-evict after TTL)
router.post("/unsubscribe", async (req, res) => {
  try {
    const schema = z.object({
      symbol: z.string().regex(/^[A-Z]{1,6}$/i, "Invalid symbol format"),
    });

    const { symbol } = schema.parse(req.body);
    const result = await unsubscribeSymbol(symbol);

    res.json({ symbol: symbol.toUpperCase(), ...result });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: e.errors });
    }
    console.error("Unsubscribe error:", e);
    res.status(500).json({ error: e?.message || "Unsubscription failed" });
  }
});

export default router;
