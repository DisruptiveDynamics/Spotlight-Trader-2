// Optional market audit tap - validates bar/tape/vwap consistency
// Passive logging only, no functional impact - useful for debugging
// Guarded behind flags.marketAudit (default: false)

import { eventBus } from "./eventBus";
import { getSessionVWAPForSymbol } from "@server/indicators/vwap";
import { flags } from "@shared/flags";

class MarketAuditTap {
  private lastTickPrices = new Map<string, number>();
  private isActive = false;

  start(): void {
    if (!flags.marketAudit) {
      console.log("[AuditTap] Disabled (flag: marketAudit=false)");
      return;
    }

    this.isActive = true;
    console.log("[AuditTap] ✅ Enabled - monitoring bar/tape/vwap consistency");

    // Monitor ticks (same as Tape sees)
    const symbols = ["SPY", "QQQ"]; // Add more as needed

    for (const symbol of symbols) {
      eventBus.on(`tick:${symbol}` as const, (data) => {
        this.lastTickPrices.set(symbol, data.price);
      });

      // Monitor 1m bar closes
      eventBus.on(`bar:new:${symbol}:1m` as any, (data) => {
        this.auditBar(symbol, data);
      });
    }
  }

  private auditBar(symbol: string, bar: any): void {
    if (!this.isActive) return;

    const lastTickPrice = this.lastTickPrices.get(symbol);
    const barClose = bar.ohlcv?.c || bar.close;
    const sessionVWAP = getSessionVWAPForSymbol(symbol);

    // Check 1: Bar close should match last tick price (within $0.03)
    if (lastTickPrice !== undefined) {
      const priceDiff = Math.abs(barClose - lastTickPrice);
      if (priceDiff > 0.03) {
        console.warn(
          `[Audit] ⚠️  Price mismatch: ${symbol} bar.close=${barClose.toFixed(2)}, lastTick=${lastTickPrice.toFixed(2)} (diff=$${priceDiff.toFixed(3)})`,
        );
      } else {
        console.log(
          `[Audit] ✅ Price OK: ${symbol} bar.close ≈ lastTick (diff=$${priceDiff.toFixed(3)})`,
        );
      }
    }

    // Check 2: VWAP from session should be reasonable (no exact validation, just sanity)
    if (sessionVWAP !== undefined) {
      const vwapDiff = Math.abs(barClose - sessionVWAP);
      const vwapDiffPercent = (vwapDiff / barClose) * 100;

      if (vwapDiffPercent > 5) {
        console.warn(
          `[Audit] ⚠️  VWAP far from price: ${symbol} VWAP=${sessionVWAP.toFixed(2)}, close=${barClose.toFixed(2)} (${vwapDiffPercent.toFixed(1)}% diff)`,
        );
      } else {
        console.log(
          `[Audit] ✅ VWAP OK: ${symbol} VWAP=${sessionVWAP.toFixed(2)}, close=${barClose.toFixed(2)} (${vwapDiffPercent.toFixed(1)}% diff)`,
        );
      }
    }

    // Log bar summary
    console.log(
      `[Audit] Bar: ${symbol} ${bar.bar_start} → ${bar.bar_end}, OHLCV: ${bar.ohlcv?.o.toFixed(2)}/${bar.ohlcv?.h.toFixed(2)}/${bar.ohlcv?.l.toFixed(2)}/${bar.ohlcv?.c.toFixed(2)}, vol=${bar.ohlcv?.v}`,
    );
  }

  stop(): void {
    this.isActive = false;
    console.log("[AuditTap] Stopped");
  }
}

// Singleton instance
export const marketAuditTap = new MarketAuditTap();
