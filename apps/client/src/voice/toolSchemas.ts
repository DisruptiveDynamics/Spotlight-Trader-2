export const toolSchemas = [
  {
    type: "function" as const,
    name: "get_chart_snapshot",
    description:
      "Get current market data snapshot with bars, indicators, and session stats for a symbol",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol (e.g., SPY, QQQ)" },
        timeframe: {
          type: "string",
          enum: ["1m", "2m", "5m", "10m", "15m", "30m", "1h"],
          description: "Chart timeframe (default: 5m)",
        },
        barCount: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Number of bars to retrieve (default: 50)",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_market_regime",
    description: "Get current market regime (trend/chop) and volatility for a symbol",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        timeframe: {
          type: "string",
          enum: ["1m", "2m", "5m", "10m", "15m", "30m", "1h"],
          description: "Timeframe for regime detection",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_recent_journal",
    description: "Get recent journal entries and trading notes",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max entries to return" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_active_rules",
    description: "Get active trading rules and alerts",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max rules to return" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_recent_signals",
    description: "Get recent trading signals and alerts",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max signals to return" },
        symbol: { type: "string", description: "Filter by symbol" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_playbook",
    description: "Search trading playbook for strategies and setups",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Max results" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_glossary",
    description: "Search trading glossary for definitions and terms",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Max results" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];
