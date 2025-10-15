import { describe, it, expect, beforeEach } from 'vitest';
import { BarBuilder } from '../BarBuilder';
import { Bar } from '../types';

describe('BarBuilder', () => {
  let barBuilder: BarBuilder;

  beforeEach(() => {
    barBuilder = new BarBuilder();
  });

  it('should never mutate finalized bars', () => {
    // Create a series of bars with different timestamps
    const bar1: Bar = { timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000, seq: 1 };
    const bar2: Bar = { timestamp: 2000, open: 105, high: 115, low: 95, close: 110, volume: 2000, seq: 2 };

    // Process first bar
    barBuilder.processBar(bar1);

    // Process second bar which should finalize the first
    const finalizedBars = barBuilder.processBar(bar2);

    // Get a reference to the first finalized bar
    const finalizedBar1 = finalizedBars[0];

    // Attempt to modify the original bar
    bar1.close = 200;

    // The finalized bar should not be affected by changes to the original
    expect(finalizedBar1.close).toBe(105);

    // Attempt to modify the finalized bar directly
    finalizedBar1.close = 300;

    // Get bars again to verify they weren't modified
    const barsAfterAttemptedModification = barBuilder.getAllBars();

    // The actual stored finalized bar should not be affected
    expect(barsAfterAttemptedModification[0].close).toBe(105);
  });

  it('should maintain strictly increasing seq', () => {
    const seqs = barBuilder.generateSequence(10);

    // Ensure seqs are strictly increasing
    expect(seqs.length).toBe(10);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it('should handle minute boundary correctly', () => {
    // Create bars at minute boundaries
    const bar1: Bar = { timestamp: 60000, open: 100, high: 110, low: 90, close: 105, volume: 1000, seq: 1 };
    const bar2: Bar = { timestamp: 120000, open: 105, high: 115, low: 95, close: 110, volume: 2000, seq: 2 };
    const bar3: Bar = { timestamp: 180000, open: 110, high: 120, low: 100, close: 115, volume: 3000, seq: 3 };

    // Process the bars
    barBuilder.processBar(bar1);
    barBuilder.processBar(bar2);
    const finalized = barBuilder.processBar(bar3);

    // Should have 2 finalized bars
    expect(finalized.length).toBe(2);

    // Verify the timestamps are preserved correctly
    expect(finalized[0].timestamp).toBe(60000);
    expect(finalized[1].timestamp).toBe(120000);

    // The current bar should be the last one
    const allBars = barBuilder.getAllBars();
    expect(allBars.length).toBe(3);
    expect(allBars[2].timestamp).toBe(180000);
  });
});
