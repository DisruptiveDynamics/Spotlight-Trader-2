export const TOOL_CONTRACT_VERSION = '1.0.0';

export const TOOL_CONTRACTS = {
  get_chart_snapshot: {
    version: '1.0.0',
    input: {
      symbol: 'string',
      timeframe: 'string',
      lookback: 'number',
    },
    output: {
      symbol: 'string',
      timeframe: 'string',
      bars: 'Bar[]',
      indicators: 'object',
      session: 'object',
      volatility: "'low' | 'medium' | 'high'",
      regime: "'trend-up' | 'trend-down' | 'chop' | 'news'",
    },
  },
  subscribe_market_stream: {
    version: '1.0.0',
    input: {
      symbol: 'string',
      timeframe: 'string',
    },
    output: {
      subscriptionId: 'string',
      streamUrl: 'string',
    },
  },
  propose_callout: {
    version: '1.0.0',
    input: {
      kind: "'watch' | 'entry' | 'exit' | 'note'",
      context: {
        symbol: 'string',
        timeframe: 'string',
        setupTag: 'string',
        rationale: 'string',
        qualityGrade: "'A' | 'B' | 'C'",
        urgency: "'now' | 'soon' | 'watch'",
      },
    },
    output: {
      id: 'string',
      kind: "'watch' | 'entry' | 'exit' | 'note'",
      setupTag: 'string',
      rationale: 'string',
      qualityGrade: "'A' | 'B' | 'C'",
      urgency: "'now' | 'soon' | 'watch'",
      timestamp: 'number',
    },
  },
  propose_entry_exit: {
    version: '1.0.0',
    input: {
      type: "'entry' | 'exit'",
      symbol: 'string',
      timeframe: 'string',
      price: 'number',
      stop: 'number',
      target1: 'number',
      target2: 'number?',
      rationale: 'string',
      rulesRef: 'string?',
    },
    output: {
      id: 'string',
      type: "'entry' | 'exit'",
      rMultiples: 'object',
      rulesPass: 'boolean',
      rulesReasons: 'string[]',
      timestamp: 'number',
    },
  },
  evaluate_rules: {
    version: '1.0.0',
    input: {
      context: {
        symbol: 'string',
        timeframe: 'string',
        riskAmount: 'number?',
        setupQuality: "'A' | 'B' | 'C'?",
        regime: 'string?',
        breadth: 'object?',
      },
    },
    output: {
      pass: 'boolean',
      version: 'string',
      rules: 'Array<{name: string, pass: boolean, reason?: string}>',
      circuitBreaker: '{active: boolean, reason?: string}',
    },
  },
  log_journal_event: {
    version: '1.0.0',
    input: {
      type: "'entry' | 'exit' | 'note' | 'decision'",
      payload: 'object',
    },
    output: {
      id: 'string',
      timestamp: 'number',
    },
  },
  summarize_session: {
    version: '1.0.0',
    input: {
      range: 'string | {from: number, to: number}',
    },
    output: {
      period: 'string',
      expectancyBySetup: 'Array<object>',
      ruleViolations: 'Array<object>',
      plInR: 'number',
      winRate: 'number',
      focusList: 'string[]',
      markdown: 'string',
    },
  },
  get_pattern_summary: {
    version: '1.0.0',
    input: {
      symbol: 'string',
      timeframe: 'string',
    },
    output: {
      symbol: 'string',
      timeframe: 'string',
      stats: 'Array<object>',
    },
  },
  get_recommended_risk_box: {
    version: '1.0.0',
    input: {
      symbol: 'string',
      timeframe: 'string',
      setup: 'string',
    },
    output: {
      stop: 'number',
      target1: 'number',
      target2: 'number',
      expectedHoldBars: 'number',
      atr: 'number',
      confidence: "'low' | 'medium' | 'high'",
    },
  },
  generate_trade_plan: {
    version: '1.0.0',
    input: {
      symbol: 'string',
      timeframe: 'string',
    },
    output: {
      symbol: 'string',
      timeframe: 'string',
      levels: 'object',
      volumeProfile: 'object',
      atr: 'number',
      gamePlan: 'string[]',
    },
  },
} as const;
