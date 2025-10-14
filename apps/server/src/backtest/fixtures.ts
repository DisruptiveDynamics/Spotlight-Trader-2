/**
 * Golden test fixtures for deterministic backtest validation
 * These fixtures lock in expected behavior
 */

import type { Rule } from "@shared/types/rules";
import type { Bar } from "@shared/types";

/**
 * Sample bars for testing
 * 5 consecutive 1-minute bars for SPY
 */
export const sampleBars: Bar[] = [
  {
    symbol: "SPY",
    timestamp: 1700000000000,
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
    timestamp: 1700000060000,
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
    timestamp: 1700000120000,
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
    timestamp: 1700000180000,
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
    timestamp: 1700000240000,
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
    description: "Trigger on volume > 130k and price increase",
    expression: "volume > 130000 && close > open",
    createdAt: new Date("2024-01-01").getTime(),
    updatedAt: new Date("2024-01-01").getTime(),
    version: 1,
  },
  {
    id: "test-rule-3",
    name: "Price Range",
    description: "Trigger when price in range 450.6-451.1",
    expression: "close >= 450.6 && close <= 451.1",
    createdAt: new Date("2024-01-01").getTime(),
    updatedAt: new Date("2024-01-01").getTime(),
    version: 1,
  },
  {
    id: "test-rule-4",
    name: "VWAP Cross",
    description: "Price crosses above VWAP",
    expression: "close > vwap && open <= vwap",
    createdAt: new Date("2024-01-01").getTime(),
    updatedAt: new Date("2024-01-01").getTime(),
    version: 1,
  },
  {
    id: "test-rule-5",
    name: "EMA Golden Cross",
    description: "EMA9 crosses above EMA20",
    expression: "ema9 > ema20",
    createdAt: new Date("2024-01-01").getTime(),
    updatedAt: new Date("2024-01-01").getTime(),
    version: 1,
  },
];

/**
 * Expected trigger results for the sample data
 */
export const expectedTriggers = {
  "test-rule-1": [
    {
      seq: 1001,
      direction: "long",
      confidence: 1.0,
      price: 450.8,
    },
    {
      seq: 1002,
      direction: "long",
      confidence: 1.0,
      price: 451.0,
    },
    {
      seq: 1003,
      direction: "long",
      confidence: 1.0,
      price: 450.7,
    },
  ],
  "test-rule-2": [
    {
      seq: 1002,
      direction: "long",
      confidence: 1.0,
      price: 451.0,
    },
  ],
  "test-rule-3": [
    {
      seq: 1002,
      direction: "long",
      confidence: 1.0,
      price: 451.0,
    },
    {
      seq: 1003,
      direction: "long",
      confidence: 1.0,
      price: 450.7,
    },
  ],
};

/**
 * Golden test cases for deterministic backtest validation
 */
export const goldenTestCases = [
  {
    name: "Simple price threshold",
    bars: sampleBars,
    rules: [sampleRules[0]!],
    expectedTriggerCount: 3,
    expectedFirstTrigger: { ruleId: "test-rule-1", seq: 1001, price: 450.8 },
    expectedMetrics: { avgHoldBars: 0, triggersPerDay: 0, regimeBreakdown: {} },
  },
  {
    name: "Volume breakout",
    bars: sampleBars,
    rules: [sampleRules[1]!],
    expectedTriggerCount: 1,
    expectedFirstTrigger: { ruleId: "test-rule-2", seq: 1002, price: 451.0 },
    expectedMetrics: { avgHoldBars: 0, triggersPerDay: 0, regimeBreakdown: {} },
  },
  {
    name: "Price range",
    bars: sampleBars,
    rules: [sampleRules[2]!],
    expectedTriggerCount: 2,
    expectedFirstTrigger: { ruleId: "test-rule-3", seq: 1002, price: 451.0 },
    expectedMetrics: { avgHoldBars: 0, triggersPerDay: 0, regimeBreakdown: {} },
  },
];

/**
 * Bars with higher volatility for stress testing
 */
export const volatileBars: Bar[] = [
  {
    symbol: "TSLA",
    timestamp: 1700000000000,
    seq: 2000,
    bar_start: 1700000000000,
    bar_end: 1700000060000,
    open: 200.0,
    high: 205.0,
    low: 198.0,
    close: 203.0,
    volume: 500000,
  },
  {
    symbol: "TSLA",
    timestamp: 1700000060000,
    seq: 2001,
    bar_start: 1700000060000,
    bar_end: 1700000120000,
    open: 203.0,
    high: 210.0,
    low: 201.0,
    close: 207.5,
    volume: 750000,
  },
  {
    symbol: "TSLA",
    timestamp: 1700000120000,
    seq: 2002,
    bar_start: 1700000120000,
    bar_end: 1700000180000,
    open: 207.5,
    high: 209.0,
    low: 195.0,
    close: 196.0,
    volume: 1200000,
  },
];
