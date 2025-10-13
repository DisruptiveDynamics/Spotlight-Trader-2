/**
 * Golden test fixtures for deterministic backtest validation
 * These fixtures lock in expected behavior
 */

import type { Rule } from "@shared/types/rules";
import type { Bar } from "../market/eventBus";

/**
 * Sample bars for testing
 * 5 consecutive 1-minute bars for SPY
 */
export const sampleBars: Bar[] = [
  {
    symbol: "SPY",
    timeframe: "1m",
    seq: 1000,
    bar_start: 1700000000000,
    bar_end: 1700000060000,
    open: 450.0,
    high: 450.5,
    low: 449.8,
    close: 450.2,
    volume: 100000,
  },
  {
    symbol: "SPY",
    timeframe: "1m",
    seq: 1001,
    bar_start: 1700000060000,
    bar_end: 1700000120000,
    open: 450.2,
    high: 451.0,
    low: 450.1,
    close: 450.8,
    volume: 120000,
  },
  {
    symbol: "SPY",
    timeframe: "1m",
    seq: 1002,
    bar_start: 1700000120000,
    bar_end: 1700000180000,
    open: 450.8,
    high: 451.2,
    low: 450.6,
    close: 451.0,
    volume: 150000,
  },
  {
    symbol: "SPY",
    timeframe: "1m",
    seq: 1003,
    bar_start: 1700000180000,
    bar_end: 1700000240000,
    open: 451.0,
    high: 451.5,
    low: 450.5,
    close: 450.7,
    volume: 90000,
  },
  {
    symbol: "SPY",
    timeframe: "1m",
    seq: 1004,
    bar_start: 1700000240000,
    bar_end: 1700000300000,
    open: 450.7,
    high: 450.9,
    low: 450.3,
    close: 450.5,
    volume: 80000,
  },
];

/**
 * Sample rules for testing
 */
export const sampleRules: Rule[] = [
  {
    id: "test-rule-1",
    name: "Price Above 450.5",
    description: "Trigger when close > 450.5",
    expression: "close > 450.5",
    createdAt: new Date("2024-01-01").getTime(),
    updatedAt: new Date("2024-01-01").getTime(),
    version: 1,
  },
  {
    id: "test-rule-2",
    name: "High Volume Breakout",
    description: "Trigger when volume > 100k and close > open",
    expression: "volume > 100000 && close > open",
    createdAt: new Date("2024-01-01").getTime(),
    updatedAt: new Date("2024-01-01").getTime(),
    version: 1,
  },
  {
    id: "test-rule-3",
    name: "Price Below 451",
    description: "Trigger when close < 451",
    expression: "close < 451",
    createdAt: new Date("2024-01-01").getTime(),
    updatedAt: new Date("2024-01-01").getTime(),
    version: 1,
  },
];

/**
 * Expected triggers for golden test validation
 * Maps rule ID to expected trigger sequences
 */
export const expectedTriggers = {
  "test-rule-1": [
    // close > 450.5: triggers on bar seq 1001 (450.8), 1002 (451.0), 1003 (450.7)
    { seq: 1001, price: 450.8 },
    { seq: 1002, price: 451.0 },
    { seq: 1003, price: 450.7 },
  ],
  "test-rule-2": [
    // volume > 100k && close > open: triggers on 1001, 1002
    { seq: 1001, price: 450.8 },
    { seq: 1002, price: 451.0 },
  ],
  "test-rule-3": [
    // close < 451: triggers on 1000 (450.2), 1001 (450.8), 1003 (450.7), 1004 (450.5)
    { seq: 1000, price: 450.2 },
    { seq: 1001, price: 450.8 },
    { seq: 1003, price: 450.7 },
    { seq: 1004, price: 450.5 },
  ],
};

/**
 * Test scenarios combining rules and expected results
 */
export interface GoldenTestCase {
  name: string;
  description: string;
  rules: Rule[];
  bars: Bar[];
  expectedTriggerCount: number;
  expectedFirstTrigger?: {
    ruleId: string;
    seq: number;
    price: number;
  };
  expectedMetrics: {
    avgHoldBars: number;
    triggersPerDay: number;
    regimeBreakdown: Record<string, number>;
  };
}

export const goldenTestCases: GoldenTestCase[] = [
  {
    name: "Single Rule - Price Threshold",
    description: "Test a simple price threshold rule",
    rules: [sampleRules[0]!], // Price Above 450.5
    bars: sampleBars,
    expectedTriggerCount: 3,
    expectedFirstTrigger: {
      ruleId: "test-rule-1",
      seq: 1001,
      price: 450.8,
    },
    expectedMetrics: {
      avgHoldBars: 0.5, // (1 + 0) / 2 = 0.5 hold bars between triggers
      triggersPerDay: 1036800.0, // 3 triggers over 5 minutes = very high daily rate
      regimeBreakdown: {
        "23:00": 3, // All triggers happen at hour 23 (UTC time 1700000000000)
      },
    },
  },
  {
    name: "Multiple Rules - Volume and Price",
    description: "Test multiple rules firing on the same bars",
    rules: [sampleRules[0]!, sampleRules[1]!],
    bars: sampleBars,
    expectedTriggerCount: 5, // rule-1: 3 triggers, rule-2: 2 triggers
    expectedMetrics: {
      avgHoldBars: 0.5, // Average hold between 5 triggers
      triggersPerDay: 1728000.0, // 5 triggers over 5 minutes
      regimeBreakdown: {
        "23:00": 5, // All triggers at hour 23
      },
    },
  },
  {
    name: "Opposite Direction Rules",
    description: "Test long and short rules on the same data",
    rules: [sampleRules[0]!, sampleRules[2]!],
    bars: sampleBars,
    expectedTriggerCount: 7, // rule-1: 3 triggers, rule-3: 4 triggers
    expectedMetrics: {
      avgHoldBars: 0.5, // Average hold between 7 triggers
      triggersPerDay: 2419200.0, // 7 triggers over 5 minutes
      regimeBreakdown: {
        "23:00": 7, // All triggers at hour 23
      },
    },
  },
  {
    name: "No Triggers",
    description: "Test rule that should never trigger",
    rules: [
      {
        id: "test-rule-never",
        name: "Impossible Condition",
        description: "Price above 500 (impossible for this data)",
        expression: "close > 500",
        createdAt: new Date("2024-01-01").getTime(),
        updatedAt: new Date("2024-01-01").getTime(),
        version: 1,
      },
    ],
    bars: sampleBars,
    expectedTriggerCount: 0,
    expectedMetrics: {
      avgHoldBars: 0,
      triggersPerDay: 0,
      regimeBreakdown: {},
    },
  },
];
