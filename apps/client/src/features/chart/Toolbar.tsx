import { useState } from 'react';
import { useChartState } from '../../state/chartState';
import type { Timeframe, Layout, ChartStyle } from '../../state/chartState';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', 'D'];
const LAYOUTS: Layout[] = ['1x1', '2x1', '2x2'];
const CHART_STYLES: ChartStyle[] = ['candles', 'bars', 'line'];

interface ToolbarProps {
  status?: 'live' | 'paused' | 'reconnecting';
}

export function Toolbar({ status = 'live' }: ToolbarProps) {
  const {
    active,
    layout,
    chartStyle,
    overlays,
    favorites,
    setSymbol,
    setTimeframe,
    setLayout,
    setChartStyle,
    setOverlays,
    clearVwapAnchor,
    addEma,
    removeEma,
    addFavorite,
    removeFavorite,
  } = useChartState();

  const [symbolInput, setSymbolInput] = useState(active.symbol);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [showStudies, setShowStudies] = useState(false);
  const [emaInput, setEmaInput] = useState('');

  // Popular symbols for quick access
  const popularSymbols = [
    'SPY',
    'QQQ',
    'NVDA',
    'TSLA',
    'AAPL',
    'MSFT',
    'GOOGL',
    'AMZN',
    'META',
    'AMD',
  ];

  // Filter symbols based on input
  const filteredSymbols = [
    ...favorites,
    ...popularSymbols.filter((s) => !favorites.includes(s)),
  ].filter((s) => s.toLowerCase().includes(symbolInput.toLowerCase()));

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbolInput.trim()) {
      setSymbol(symbolInput.trim());
      setShowSymbolDropdown(false);
    }
  };

  const handleSymbolSelect = (symbol: string) => {
    setSymbol(symbol);
    setSymbolInput(symbol);
    setShowSymbolDropdown(false);
  };

  const handleAddEma = () => {
    const period = parseInt(emaInput);
    if (period > 0 && !overlays.ema.includes(period)) {
      addEma(period);
      setEmaInput('');
    }
  };

  const statusColors = {
    live: 'bg-green-500/20 text-green-400 border-green-500',
    paused: 'bg-amber-500/20 text-amber-400 border-amber-500',
    reconnecting: 'bg-red-500/20 text-red-400 border-red-500',
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
      {/* Left: Symbol Input with Dropdown */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <form onSubmit={handleSymbolSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => {
                setSymbolInput(e.target.value.toUpperCase());
                setShowSymbolDropdown(true);
              }}
              onFocus={() => setShowSymbolDropdown(true)}
              onBlur={() => setTimeout(() => setShowSymbolDropdown(false), 200)}
              className="w-28 px-2 py-1 text-sm font-mono bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              placeholder="Symbol"
            />
          </form>

          {showSymbolDropdown && filteredSymbols.length > 0 && (
            <div className="absolute top-full left-0 z-50 w-48 mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto">
              <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">
                Favorites & Popular
              </div>
              {filteredSymbols.slice(0, 10).map((symbol) => (
                <div
                  key={symbol}
                  className="flex items-center justify-between hover:bg-gray-800 transition-colors"
                >
                  <button
                    onClick={() => handleSymbolSelect(symbol)}
                    className="flex-1 px-3 py-2 text-left text-sm font-mono"
                  >
                    {symbol}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (favorites.includes(symbol)) {
                        removeFavorite(symbol);
                      } else {
                        addFavorite(symbol);
                      }
                    }}
                    className="px-2 text-sm hover:scale-110 transition-transform"
                  >
                    <span
                      className={favorites.includes(symbol) ? 'text-yellow-500' : 'text-gray-600'}
                    >
                      ★
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500">Last: {active.symbol}</div>
      </div>

      {/* Center: Timeframe Buttons */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              active.timeframe === tf
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Studies Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStudies(!showStudies)}
            className="px-3 py-1 text-xs font-medium text-gray-400 transition-colors bg-gray-800 rounded hover:text-white hover:bg-gray-700"
          >
            Studies
          </button>
          {showStudies && (
            <div className="absolute right-0 z-50 w-64 mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg">
              <div className="p-3 space-y-3">
                {/* EMA */}
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-300">EMA</div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {overlays.ema.map((period) => (
                      <span
                        key={period}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 rounded"
                      >
                        {period}
                        <button
                          onClick={() => removeEma(period)}
                          className="text-blue-200 hover:text-white"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      value={emaInput}
                      onChange={(e) => setEmaInput(e.target.value)}
                      placeholder="Period"
                      className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleAddEma}
                      className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Bollinger */}
                <div>
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={overlays.boll !== null}
                      onChange={(e) =>
                        setOverlays({
                          boll: e.target.checked ? { period: 20, stdDev: 2 } : null,
                        })
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500"
                    />
                    Bollinger Bands
                  </label>
                  {overlays.boll && (
                    <div className="mt-1 ml-6 space-y-1">
                      <input
                        type="number"
                        value={overlays.boll.period}
                        onChange={(e) =>
                          setOverlays({
                            boll: { ...overlays.boll!, period: parseInt(e.target.value) },
                          })
                        }
                        placeholder="Period"
                        className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={overlays.boll.stdDev}
                        onChange={(e) =>
                          setOverlays({
                            boll: { ...overlays.boll!, stdDev: parseFloat(e.target.value) },
                          })
                        }
                        placeholder="Std Dev"
                        className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* VWAP */}
                <div>
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={overlays.vwap !== null}
                      onChange={(e) =>
                        setOverlays({
                          vwap: e.target.checked ? { mode: 'session' } : null,
                        })
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500"
                    />
                    VWAP
                  </label>
                  {overlays.vwap && (
                    <div className="mt-1 ml-6 space-y-1">
                      <select
                        value={overlays.vwap.mode}
                        onChange={(e) => {
                          const mode = e.target.value as 'session' | 'anchored';
                          const newVwap: any = { mode };
                          if (mode === 'anchored' && overlays.vwap?.anchorMs) {
                            newVwap.anchorMs = overlays.vwap.anchorMs;
                          }
                          setOverlays({ vwap: newVwap });
                        }}
                        className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                      >
                        <option value="session">Session</option>
                        <option value="anchored">Anchored</option>
                      </select>
                      {overlays.vwap.mode === 'anchored' && overlays.vwap.anchorMs && (
                        <button
                          onClick={clearVwapAnchor}
                          className="w-full px-2 py-1 text-xs text-left text-gray-400 hover:text-white"
                        >
                          Clear anchor
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Shared Crosshair */}
                <div>
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={overlays.sharedCrosshair}
                      onChange={(e) => setOverlays({ sharedCrosshair: e.target.checked })}
                      className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500"
                    />
                    Shared Crosshair
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Layout Buttons */}
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded">
          {LAYOUTS.map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                layout === l
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Chart Style */}
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded">
          {CHART_STYLES.map((style) => (
            <button
              key={style}
              onClick={() => setChartStyle(style)}
              className={`px-2 py-1 text-xs font-medium rounded capitalize transition-colors ${
                chartStyle === style
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {style}
            </button>
          ))}
        </div>

        {/* Status Pill */}
        <div className={`px-2 py-1 text-xs font-mono rounded border ${statusColors[status]}`}>
          {status.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
