import { EventEmitter } from "events";
import { voiceCalloutBridge } from "../realtime/voiceCalloutBridge";

interface MarketCondition {
  symbol: string;
  condition:
    | "volume_surge"
    | "volume_divergence"
    | "tape_slowdown"
    | "regime_shift"
    | "pattern_forming";
  severity: "info" | "warning" | "critical";
  message: string;
  data?: any;
}

class ProactiveCoachingEngine extends EventEmitter {
  private lastVolumeAlert = new Map<string, number>();
  private lastRegimeCheck = new Map<string, string>();
  private readonly ALERT_COOLDOWN_MS = 60000; // 1 minute between same alerts

  constructor() {
    super();
  }

  setupMarketMonitoring(telemetryBus: EventEmitter): void {
    // Monitor bars for proactive insights
    telemetryBus.on("bar:new", (bar: any) => {
      this.checkVolumeDivergence(bar);
      this.checkRegimeShift(bar);
      this.checkPatternFormation(bar);
    });
  }

  private checkVolumeDivergence(bar: any): void {
    const { symbol, ohlcv, indicators } = bar;

    if (!indicators?.volume_ma) return;

    const currentVolume = ohlcv.v;
    const volumeMA = indicators.volume_ma;
    const volumeRatio = currentVolume / volumeMA;

    // Volume surge (potential breakout forming)
    if (volumeRatio > 1.5 && this.shouldAlert(symbol, "volume_surge")) {
      this.emit("coaching_alert", {
        symbol,
        condition: "volume_surge",
        severity: "warning",
        message: `${symbol} volume surging at ${(volumeRatio * 100).toFixed(0)}% of average. Watch for breakout setup.`,
        data: { volumeRatio, price: ohlcv.c },
      } as MarketCondition);
    }

    // Volume divergence (price up, volume down = weakness)
    const priceChange = (ohlcv.c - ohlcv.o) / ohlcv.o;
    if (priceChange > 0.002 && volumeRatio < 0.7 && this.shouldAlert(symbol, "volume_divergence")) {
      this.emit("coaching_alert", {
        symbol,
        condition: "volume_divergence",
        severity: "warning",
        message: `${symbol} price rising but volume declining at ${(volumeRatio * 100).toFixed(0)}%. Potential weakness.`,
        data: { volumeRatio, priceChange: (priceChange * 100).toFixed(2) },
      } as MarketCondition);
    }
  }

  private checkRegimeShift(bar: any): void {
    const { symbol, indicators } = bar;

    if (!indicators?.regime) return;

    const currentRegime = indicators.regime;
    const lastRegime = this.lastRegimeCheck.get(symbol);

    if (lastRegime && lastRegime !== currentRegime) {
      this.emit("coaching_alert", {
        symbol,
        condition: "regime_shift",
        severity: "critical",
        message: `${symbol} regime shift: ${lastRegime} → ${currentRegime}. Adjust strategy.`,
        data: { from: lastRegime, to: currentRegime },
      } as MarketCondition);
    }

    this.lastRegimeCheck.set(symbol, currentRegime);
  }

  private checkPatternFormation(bar: any): void {
    const { symbol, ohlcv, indicators } = bar;

    if (!indicators?.vwap || !indicators?.ema9) return;

    const price = ohlcv.c;
    const vwap = indicators.vwap;
    const ema9 = indicators.ema9;

    // Pattern forming: Price approaching VWAP from below
    const distanceToVWAP = (vwap - price) / price;
    if (
      distanceToVWAP > 0 &&
      distanceToVWAP < 0.002 &&
      this.shouldAlert(symbol, "pattern_forming_vwap")
    ) {
      this.emit("coaching_alert", {
        symbol,
        condition: "pattern_forming",
        severity: "info",
        message: `${symbol} approaching VWAP from below. Potential reclaim setup forming.`,
        data: { price, vwap, distance: (distanceToVWAP * 100).toFixed(2) },
      } as MarketCondition);
    }

    // Pattern forming: Price pulling back to EMA9 in uptrend
    const distanceToEMA = (price - ema9) / price;
    if (
      distanceToEMA > -0.003 &&
      distanceToEMA < 0.001 &&
      this.shouldAlert(symbol, "pattern_forming_ema")
    ) {
      this.emit("coaching_alert", {
        symbol,
        condition: "pattern_forming",
        severity: "info",
        message: `${symbol} pulling back to 9 EMA. Potential pullback entry forming.`,
        data: { price, ema9, distance: (distanceToEMA * 100).toFixed(2) },
      } as MarketCondition);
    }

    // Tape slowdown: Volume declining and range tightening
    if (indicators.volume_ma && indicators.atr) {
      const currentVolume = ohlcv.v;
      const volumeMA = indicators.volume_ma;
      const currentRange = ohlcv.h - ohlcv.l;
      const atr = indicators.atr;

      const volumeRatio = currentVolume / volumeMA;
      const rangeRatio = currentRange / atr;

      // Tape slowdown: volume <70% average AND range <50% ATR
      if (volumeRatio < 0.7 && rangeRatio < 0.5 && this.shouldAlert(symbol, "tape_slowdown")) {
        this.emit("coaching_alert", {
          symbol,
          condition: "tape_slowdown",
          severity: "warning",
          message: `${symbol} tape slowing down. Volume ${(volumeRatio * 100).toFixed(0)}% of average, range tightening. Wait for expansion.`,
          data: { volumeRatio, rangeRatio },
        } as MarketCondition);
      }
    }
  }

  private shouldAlert(symbol: string, alertType: string): boolean {
    const key = `${symbol}:${alertType}`;
    const lastAlert = this.lastVolumeAlert.get(key) || 0;
    const now = Date.now();

    if (now - lastAlert > this.ALERT_COOLDOWN_MS) {
      this.lastVolumeAlert.set(key, now);
      return true;
    }

    return false;
  }

  // Send coaching alert to voice sessions
  broadcastToVoice(condition: MarketCondition, userId: string): void {
    // This would integrate with voiceCalloutBridge
    // For now, we emit for other systems to consume
    console.log("[ProactiveCoaching] Alert:", condition);
  }
}

export const proactiveCoachingEngine = new ProactiveCoachingEngine();

// Wire up to copilot broadcaster for voice delivery
import { copilotBroadcaster } from "../copilot/broadcaster";

proactiveCoachingEngine.on("coaching_alert", (alert: MarketCondition) => {
  console.log("[ProactiveCoaching] Market condition detected:", alert);

  // Broadcast to copilot system (which feeds to voice via VoiceCalloutBridge)
  copilotBroadcaster.emit("callout", {
    id: `proactive_${Date.now()}`,
    userId: "demo-user", // In production, would map to active voice sessions
    symbol: alert.symbol,
    setupTag: alert.condition,
    urgency:
      alert.severity === "critical" ? "high" : alert.severity === "warning" ? "medium" : "low",
    qualityGrade: "B",
    rationale: alert.message,
    timestamp: new Date(),
    data: alert.data,
  });
});
