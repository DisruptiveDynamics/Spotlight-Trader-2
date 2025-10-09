import { useState } from 'react';

interface BacktestParams {
  symbol: string;
  timeframe: '1m';
  start: string;
  end: string;
}

interface BacktestResult {
  bars: number;
  triggers: Array<{
    ruleId: string;
    seq: number;
    direction: 'long' | 'short';
    confidence: number;
    ts: number;
    price: number;
  }>;
  metrics: {
    avgHoldBars: number;
    triggersPerDay: number;
    regimeBreakdown: Record<string, number>;
  };
}

export function BacktestPanel({ ruleIds }: { ruleIds: string[] }) {
  const [params, setParams] = useState<BacktestParams>({
    symbol: 'SPY',
    timeframe: '1m',
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
    end: new Date().toISOString().split('T')[0]!,
  });

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          ruleIds, // Use current ruleIds from props
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Backtest failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-900 border border-gray-700 rounded">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-200">Backtest Runner</h3>
        <span className="text-xs text-gray-500">{ruleIds.length} rule(s) selected</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Symbol</label>
          <input
            type="text"
            value={params.symbol}
            onChange={(e) => setParams({ ...params, symbol: e.target.value.toUpperCase() })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Timeframe</label>
          <select
            value={params.timeframe}
            onChange={(e) => setParams({ ...params, timeframe: e.target.value as '1m' })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="1m">1 minute</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Start Date</label>
          <input
            type="date"
            value={params.start}
            onChange={(e) => setParams({ ...params, start: e.target.value })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">End Date</label>
          <input
            type="date"
            value={params.end}
            onChange={(e) => setParams({ ...params, end: e.target.value })}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <button
        onClick={handleRun}
        disabled={loading || ruleIds.length === 0}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded transition-colors"
      >
        {loading ? 'Running...' : 'Run Backtest'}
      </button>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Triggers</div>
              <div className="text-xl font-bold text-gray-200">{result.triggers.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Avg Hold (bars)</div>
              <div className="text-xl font-bold text-gray-200">{result.metrics.avgHoldBars}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Triggers/Day</div>
              <div className="text-xl font-bold text-gray-200">
                {result.metrics.triggersPerDay.toFixed(1)}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 mb-2">Regime Breakdown</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.metrics.regimeBreakdown).map(([hour, count]) => (
                <div
                  key={hour}
                  className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300"
                >
                  {hour}: {count}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 mb-2">Triggers ({result.triggers.length})</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {result.triggers.map((trigger, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-2 py-1 bg-gray-700/50 rounded text-xs"
                >
                  <span className="text-gray-400">#{trigger.seq}</span>
                  <span
                    className={
                      trigger.direction === 'long' ? 'text-green-400' : 'text-red-400'
                    }
                  >
                    {trigger.direction.toUpperCase()}
                  </span>
                  <span className="text-gray-300">${trigger.price.toFixed(2)}</span>
                  <span className="text-gray-500">{(trigger.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
