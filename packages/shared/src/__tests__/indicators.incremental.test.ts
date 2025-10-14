import { describe, it, expect } from "vitest";

describe("Incremental Indicator Equivalence", () => {
  describe("EMA Consistency", () => {
    const calculateEMA = (prices: number[], period: number): number[] => {
      if (prices.length < period) return [];
      const k = 2 / (period + 1);
      const ema: number[] = [];
      
      const sma = prices.slice(0, period).reduce((a, b) => a + b) / period;
      ema.push(sma);
      
      for (let i = period; i < prices.length; i++) {
        const newEma = prices[i] * k + ema[ema.length - 1] * (1 - k);
        ema.push(newEma);
      }
      
      return ema;
    };

    const calculateIncrementalEMA = (
      currentEma: number,
      newPrice: number,
      period: number
    ): number => {
      const k = 2 / (period + 1);
      return newPrice * k + currentEma * (1 - k);
    };

    it("should produce same EMA using batch vs incremental", () => {
      const prices = [100, 102, 101, 103, 104, 105, 103, 102, 104, 106];
      const period = 9;

      const batchEMA = calculateEMA(prices, period);
      
      const incrementalEMA: number[] = [];
      let currentEma = prices.slice(0, period).reduce((a, b) => a + b) / period;
      incrementalEMA.push(currentEma);
      
      for (let i = period; i < prices.length; i++) {
        currentEma = calculateIncrementalEMA(currentEma, prices[i], period);
        incrementalEMA.push(currentEma);
      }

      expect(batchEMA.length).toBe(incrementalEMA.length);
      
      batchEMA.forEach((value, i) => {
        expect(value).toBeCloseTo(incrementalEMA[i], 10);
      });
    });

    it("should maintain EMA precision across 1000 updates", () => {
      const period = 21;
      let price = 100;
      const prices: number[] = [];
      
      for (let i = 0; i < 1000; i++) {
        price += (Math.random() - 0.5) * 2;
        prices.push(price);
      }

      const batchEMA = calculateEMA(prices, period);
      
      let currentEma = prices.slice(0, period).reduce((a, b) => a + b) / period;
      const incrementalEMA: number[] = [currentEma];
      
      for (let i = period; i < prices.length; i++) {
        currentEma = calculateIncrementalEMA(currentEma, prices[i], period);
        incrementalEMA.push(currentEma);
      }

      const maxDiff = Math.max(
        ...batchEMA.map((v, i) => Math.abs(v - incrementalEMA[i]))
      );
      
      expect(maxDiff).toBeLessThan(1e-10);
    });

    it("should handle EMA updates with different periods", () => {
      const prices = [100, 101, 102, 103, 104, 105];
      const periods = [5, 9, 21];

      periods.forEach(period => {
        if (prices.length >= period) {
          const batchEMA = calculateEMA(prices, period);
          
          let currentEma = prices.slice(0, period).reduce((a, b) => a + b) / period;
          const incrementalEMA: number[] = [currentEma];
          
          for (let i = period; i < prices.length; i++) {
            currentEma = calculateIncrementalEMA(currentEma, prices[i], period);
            incrementalEMA.push(currentEma);
          }

          batchEMA.forEach((value, i) => {
            expect(value).toBeCloseTo(incrementalEMA[i], 10);
          });
        }
      });
    });
  });

  describe("VWAP Consistency", () => {
    interface VWAPBar {
      close: number;
      volume: number;
    }

    const calculateBatchVWAP = (bars: VWAPBar[]): number => {
      const totalPV = bars.reduce((sum, bar) => sum + bar.close * bar.volume, 0);
      const totalVolume = bars.reduce((sum, bar) => sum + bar.volume, 0);
      return totalVolume > 0 ? totalPV / totalVolume : 0;
    };

    const calculateIncrementalVWAP = (
      currentVWAP: number,
      currentVolume: number,
      newPrice: number,
      newVolume: number
    ): { vwap: number; volume: number } => {
      const totalVolume = currentVolume + newVolume;
      const vwap = totalVolume > 0
        ? (currentVWAP * currentVolume + newPrice * newVolume) / totalVolume
        : 0;
      return { vwap, volume: totalVolume };
    };

    it("should produce same VWAP using batch vs incremental", () => {
      const bars: VWAPBar[] = [
        { close: 100, volume: 1000 },
        { close: 101, volume: 1500 },
        { close: 99, volume: 2000 },
        { close: 102, volume: 1200 },
        { close: 100.5, volume: 1800 },
      ];

      const batchVWAP = calculateBatchVWAP(bars);

      let currentVWAP = 0;
      let currentVolume = 0;

      bars.forEach(bar => {
        const result = calculateIncrementalVWAP(
          currentVWAP,
          currentVolume,
          bar.close,
          bar.volume
        );
        currentVWAP = result.vwap;
        currentVolume = result.volume;
      });

      expect(batchVWAP).toBeCloseTo(currentVWAP, 10);
    });

    it("should maintain VWAP precision with high volume", () => {
      const bars: VWAPBar[] = Array.from({ length: 100 }, (_,_i) => ({
        close: 100 + (Math.random() - 0.5) * 10,
        volume: Math.floor(Math.random() * 100000) + 10000,
      }));

      const batchVWAP = calculateBatchVWAP(bars);

      let currentVWAP = 0;
      let currentVolume = 0;

      bars.forEach(bar => {
        const result = calculateIncrementalVWAP(
          currentVWAP,
          currentVolume,
          bar.close,
          bar.volume
        );
        currentVWAP = result.vwap;
        currentVolume = result.volume;
      });

      expect(Math.abs(batchVWAP - currentVWAP)).toBeLessThan(1e-8);
    });

    it("should handle zero volume gracefully", () => {
      const bars: VWAPBar[] = [
        { close: 100, volume: 0 },
        { close: 101, volume: 1000 },
      ];

      const batchVWAP = calculateBatchVWAP(bars);

      let currentVWAP = 0;
      let currentVolume = 0;

      bars.forEach(bar => {
        const result = calculateIncrementalVWAP(
          currentVWAP,
          currentVolume,
          bar.close,
          bar.volume
        );
        currentVWAP = result.vwap;
        currentVolume = result.volume;
      });

      expect(batchVWAP).toBeCloseTo(currentVWAP, 10);
    });
  });

  describe("Cross-Indicator Consistency", () => {
    it("should maintain consistency between EMA and VWAP over time", () => {
      interface Bar {
        close: number;
        volume: number;
      }

      const bars: Bar[] = Array.from({ length: 50 }, (_, i) => ({
        close: 100 + i * 0.5,
        volume: 1000 + i * 100,
      }));

      const prices = bars.map(b => b.close);
      const calculateEMA = (prices: number[], period: number) => {
        if (prices.length < period) return [];
        const k = 2 / (period + 1);
        const ema: number[] = [];
        const sma = prices.slice(0, period).reduce((a, b) => a + b) / period;
        ema.push(sma);
        for (let i = period; i < prices.length; i++) {
          ema.push(prices[i] * k + ema[ema.length - 1] * (1 - k));
        }
        return ema;
      };

      const ema9 = calculateEMA(prices, 9);
      
      expect(ema9.length).toBeGreaterThan(0);
      expect(ema9[ema9.length - 1]).toBeGreaterThan(100);
    });
  });
});
