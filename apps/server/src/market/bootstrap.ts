import { checkPolygonAuth } from "./polygon/health.js";

type MarketSource = "polygon" | "sim";

let marketSource: MarketSource = "polygon";
let marketReason: string = "";

export async function initializeMarketSource(): Promise<void> {
  const apiKey = process.env.POLYGON_API_KEY ?? "";
  const res = await checkPolygonAuth(apiKey);

  if (res.ok) {
    console.log("✅ Polygon auth OK");
    marketSource = "polygon";
    marketReason = "";
  } else {
    const levelEmoji = res.level === "fatal" ? "❌" : "⚠️";
    console[res.level === "fatal" ? "error" : "warn"](
      `${levelEmoji} Polygon auth failed: ${res.reason}`,
    );

    if (process.env.SIMULATED_DATA !== "true") {
      console.log("🔄 Falling back to simulator mode");
      process.env.FALLBACK_SIM = "true";
    }

    marketSource = "sim";
    marketReason = res.reason || "auth failed";
  }
}

export function getMarketSource(): MarketSource {
  return marketSource;
}

export function getMarketReason(): string {
  return marketReason;
}
