/**
 * [PHASE-5] Bar Hash Utility
 * Compute deterministic hash for bar reconciliation
 * Hash includes: OHLC + volume + timestamp
 */

/**
 * Compute a simple hash for a bar (OHLC + volume + timestamp)
 * @param bar - Bar data
 * @returns Hash string
 */
export function computeBarHash(bar: {
  bar_end: number;
  ohlcv: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  };
}): string {
  const { bar_end, ohlcv } = bar;
  const components = [
    bar_end.toString(),
    ohlcv.o.toFixed(4),
    ohlcv.h.toFixed(4),
    ohlcv.l.toFixed(4),
    ohlcv.c.toFixed(4),
    ohlcv.v.toFixed(0),
  ];
  
  // Simple hash: concat and create checksum
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Reconcile local bars with server bars using hash comparison
 * @param localBars - Bars currently in client state
 * @param serverBars - Fresh bars from server
 * @returns Bars that need to be updated/added
 */
export function reconcileBars<T extends { seq: number; bar_end: number; ohlcv: { o: number; h: number; l: number; c: number; v: number } }>(
  localBars: T[],
  serverBars: T[]
): {
  toUpdate: T[];
  toAdd: T[];
  reconciled: number;
} {
  const localMap = new Map<number, string>();
  localBars.forEach((bar) => {
    localMap.set(bar.seq, computeBarHash(bar));
  });

  const toUpdate: T[] = [];
  const toAdd: T[] = [];

  serverBars.forEach((serverBar) => {
    const localHash = localMap.get(serverBar.seq);
    const serverHash = computeBarHash(serverBar);

    if (!localHash) {
      // New bar, not in local state
      toAdd.push(serverBar);
    } else if (localHash !== serverHash) {
      // Hash mismatch, bar needs update (e.g., OHLC adjusted)
      toUpdate.push(serverBar);
    }
    // else: hashes match, no action needed
  });

  return {
    toUpdate,
    toAdd,
    reconciled: toUpdate.length + toAdd.length,
  };
}
