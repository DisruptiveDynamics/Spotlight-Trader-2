const MARKET_TERMS = [
  "vwap",
  "price",
  "last price",
  "ltp",
  "close",
  "open",
  "high",
  "low",
  "ohlc",
  "volume",
  "atr",
  "rsi",
  "macd",
  "support",
  "resistance",
  "levels",
  "trend",
  "breakout",
  "pullback",
  "entry",
  "stop",
  "target",
  "risk reward",
  "rr",
  "r/r",
  "chart",
  "bars",
  "candles",
  "ema",
  "sma",
  "moving average",
  "volatility",
  "regime",
  "bullish",
  "bearish",
  "bid",
  "ask",
  "spread",
  "session",
  "premarket",
  "afterhours",
  "trading at",
];

export function isMarketQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return MARKET_TERMS.some((term) => t.includes(term));
}

export function extractSymbol(text: string): string | null {
  const match = text.match(/\b([A-Z]{1,5})\b/);
  return match?.[1] ?? null;
}

export function extractTimeframe(text: string): string {
  const match = text.match(/\b(1m|2m|5m|10m|15m|30m|1h|4h|1d)\b/i);
  return match?.[1]?.toLowerCase() ?? "1m";
}
