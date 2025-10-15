import type { InsightRequest, InsightResponse } from "@spotlight/shared";
import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";

const router = Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiting map: userId -> last request timestamps
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const MAX_REQUESTS = 2;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userRequests = rateLimitMap.get(userId) || [];

  // Remove old requests outside the window
  const recentRequests = userRequests.filter((ts) => now - ts < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= MAX_REQUESTS) {
    return false; // Rate limit exceeded
  }

  recentRequests.push(now);
  rateLimitMap.set(userId, recentRequests);
  return true;
}

router.post("/explain", async (req: Request, res: Response) => {
  try {
    const { context, question } = req.body as InsightRequest;
    const userId = req.ip || "anonymous";

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return res.status(429).json({
        error: "Rate limit exceeded. Please wait before making another request.",
      });
    }

    // Validate input
    if (!context || !question) {
      return res.status(400).json({
        error: "Missing context or question",
      });
    }

    // Build structured prompt for AI
    const systemPrompt = `You are a world-class day-trading coach who reasons from raw OHLC data and technical indicators.

Your expertise:
- Reading candlestick patterns and price action
- Interpreting technical indicators (EMA, VWAP, Bollinger Bands)
- Identifying support/resistance zones
- Explaining trade setups and risk management
- Providing concise, actionable insights

Always:
- Be specific with price levels and timeframes
- Explain WHY something is happening
- Keep responses under 150 words for voice clarity
- Use trader terminology appropriately`;

    // Build context summary
    const lastBars = context.bars.slice(-5); // Last 5 bars
    const currentBar = lastBars[lastBars.length - 1];

    const barsSummary = lastBars
      .map(
        (b) =>
          `[${new Date(b.time * 1000).toLocaleTimeString()}] O:${b.o.toFixed(2)} H:${b.h.toFixed(2)} L:${b.l.toFixed(2)} C:${b.c.toFixed(2)} V:${b.v}`,
      )
      .join("\n");

    const overlaysSummary = [];
    if (context.overlays.ema) {
      const emaValues = Object.entries(context.overlays.ema)
        .map(([period, value]) => `EMA(${period}): ${value.toFixed(2)}`)
        .join(", ");
      overlaysSummary.push(emaValues);
    }
    if (context.overlays.vwap) {
      overlaysSummary.push(`VWAP: ${context.overlays.vwap.toFixed(2)}`);
    }
    if (context.overlays.boll) {
      overlaysSummary.push(
        `Bollinger: Mid ${context.overlays.boll.mid.toFixed(2)}, Upper ${context.overlays.boll.upper.toFixed(2)}, Lower ${context.overlays.boll.lower.toFixed(2)}`,
      );
    }

    const signalsSummary =
      context.activeSignals
        ?.map((s) => `${s.direction.toUpperCase()} signal: ${s.rule} (${s.confidence}% confidence)`)
        .join("\n") || "No active signals";

    const userPrompt = `Chart Analysis Request:

Symbol: ${context.symbol}
Timeframe: ${context.timeframe}

Recent Bars:
${barsSummary}

Current Price: ${currentBar?.c.toFixed(2)}

Indicators:
${overlaysSummary.join("\n")}

Active Signals:
${signalsSummary}

Question: ${question}`;

    // Call OpenAI for analysis
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const aiResponse =
        completion.choices[0]?.message?.content || "Unable to analyze at this time.";

      const response: InsightResponse = {
        text: aiResponse,
        timestamp: Date.now(),
      };

      // Log for development
      console.log("📊 Insight Request:", {
        symbol: context.symbol,
        question: question.substring(0, 50),
        bars: context.bars.length,
      });

      res.json(response);
    } catch (aiError) {
      console.error("❌ OpenAI error:", aiError);

      // Fallback response
      const response: InsightResponse = {
        text: `I'm analyzing ${context.symbol} on the ${context.timeframe} timeframe. Current price is ${currentBar?.c.toFixed(2)}. ${
          context.overlays.ema
            ? `The EMAs show ${Object.entries(context.overlays.ema)
                .map(([p, v]) => `${p}-period at ${v.toFixed(2)}`)
                .join(", ")}.`
            : ""
        }`,
        timestamp: Date.now(),
      };

      res.json(response);
    }
  } catch (error) {
    console.error("❌ Insight error:", error);
    res.status(500).json({
      error: "Failed to generate insight",
    });
  }
});

export default router;
