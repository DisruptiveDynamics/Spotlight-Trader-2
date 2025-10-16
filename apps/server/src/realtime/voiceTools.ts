import type { toolHandlers } from "../copilot/tools/handlers";

export interface VoiceTool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export const VOICE_COPILOT_TOOLS: VoiceTool[] = [
  {
    type: "function",
    name: "get_last_price",
    description: "Get the latest price for a symbol from the market cache or provider",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol (e.g., SPY, QQQ, NVDA)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    type: "function",
    name: "get_last_vwap",
    description: "Get the current session VWAP for a symbol (ultra-low latency)",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol (e.g., SPY, QQQ, NVDA)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    type: "function",
    name: "get_last_ema",
    description: "Get the latest EMA value for a symbol at a specific period (ultra-low latency)",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol (e.g., SPY, QQQ, NVDA)",
        },
        period: {
          type: "number",
          description: "EMA period (e.g., 9, 21, 50, 200)",
          enum: [9, 21, 50, 200],
        },
      },
      required: ["symbol", "period"],
    },
  },
  {
    type: "function",
    name: "get_chart_snapshot",
    description:
      "Get current chart data including OHLCV bars, indicators, session stats, volatility, and market regime for analysis",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol (e.g., SPY, QQQ, NVDA)",
        },
        timeframe: {
          type: "string",
          description: "The chart timeframe (e.g., 1m, 5m, 15m, 1h, 1d)",
        },
        barCount: {
          type: "number",
          description: "Number of bars to return (default 50, max 200)",
        },
      },
      required: ["symbol", "timeframe"],
    },
  },
  {
    type: "function",
    name: "propose_entry_exit",
    description:
      "Calculate entry/exit proposal with R-multiples, risk/reward analysis, and rules validation",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol",
        },
        timeframe: {
          type: "string",
          description: "The chart timeframe",
        },
        type: {
          type: "string",
          enum: ["long", "short"],
          description: "Trade direction",
        },
        price: {
          type: "number",
          description: "Entry price",
        },
        stop: {
          type: "number",
          description: "Stop loss price",
        },
        target1: {
          type: "number",
          description: "First target price",
        },
        target2: {
          type: "number",
          description: "Second target price (optional)",
        },
        rationale: {
          type: "string",
          description: "The reason for this trade setup",
        },
      },
      required: ["symbol", "timeframe", "type", "price", "stop", "target1", "rationale"],
    },
  },
  {
    type: "function",
    name: "get_recommended_risk_box",
    description: "Get recommended stop loss, targets, and position sizing for a trade setup",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol",
        },
        setupTag: {
          type: "string",
          description: "The setup pattern (e.g., vwap_reclaim, orb, ema_pullback)",
        },
        entry: {
          type: "number",
          description: "Entry price",
        },
        stop: {
          type: "number",
          description: "Current stop loss price",
        },
      },
      required: ["symbol", "setupTag", "entry", "stop"],
    },
  },
  {
    type: "function",
    name: "get_pattern_summary",
    description:
      "Get historical performance stats for a trading pattern including win rate, EV-R, MAE/MFE, false break rates",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol",
        },
        setupTag: {
          type: "string",
          description: "The setup pattern name",
        },
        timeframe: {
          type: "string",
          description: "The chart timeframe",
        },
      },
      required: ["symbol", "setupTag", "timeframe"],
    },
  },
  {
    type: "function",
    name: "evaluate_rules",
    description:
      "Check if a trade passes all risk management rules (position limits, daily loss, circuit breakers)",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol",
        },
        timeframe: {
          type: "string",
          description: "The chart timeframe",
        },
        riskAmount: {
          type: "number",
          description: "Risk amount in dollars for this trade",
        },
        accountSize: {
          type: "number",
          description: "Total account size in dollars",
        },
        setupQuality: {
          type: "string",
          enum: ["A", "B", "C"],
          description: "Quality grade of the setup",
        },
        regime: {
          type: "string",
          description: "Current market regime (trend-up, trend-down, chop)",
        },
      },
      required: ["symbol", "timeframe"],
    },
  },
  {
    type: "function",
    name: "log_journal_event",
    description: "Log a trading decision, entry, exit, or note to the journal for learning loop",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["entry", "exit", "note", "decision"],
          description: "Type of journal event",
        },
        symbol: {
          type: "string",
          description: "The trading symbol",
        },
        timeframe: {
          type: "string",
          description: "The chart timeframe",
        },
        decision: {
          type: "string",
          enum: ["accept", "reject", "modify"],
          description: "The decision made",
        },
        reasoning: {
          type: "string",
          description: "The reasoning behind the decision",
        },
        qualityGrade: {
          type: "string",
          enum: ["A", "B", "C"],
          description: "Quality grade of the setup",
        },
      },
      required: ["type", "symbol", "timeframe", "reasoning"],
    },
  },
  {
    type: "function",
    name: "generate_trade_plan",
    description:
      "Generate a complete trade plan with entry zones, stop placement, targets, and risk management",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The trading symbol",
        },
        timeframe: {
          type: "string",
          description: "The chart timeframe",
        },
        setupTag: {
          type: "string",
          description: "The setup pattern",
        },
        bias: {
          type: "string",
          enum: ["long", "short"],
          description: "Trading bias/direction",
        },
      },
      required: ["symbol", "timeframe", "setupTag", "bias"],
    },
  },
];

export type VoiceToolHandlers = typeof toolHandlers;
