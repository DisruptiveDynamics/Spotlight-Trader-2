import { useState, useEffect, useRef } from 'react';
import { connectMarketSSE, type Tick } from '../lib/marketStream';

interface TapePanelProps {
  symbol: string;
  maxTicks?: number;
}

export function TapePanel({ symbol, maxTicks = 100 }: TapePanelProps) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(autoScroll);

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    let mounted = true;

    const sseConnection = connectMarketSSE([symbol]);

    sseConnection.onTick((tick: Tick) => {
      if (!mounted) return;

      setTicks(prev => {
        const updated = [tick, ...prev];
        return updated.slice(0, maxTicks);
      });

      if (autoScrollRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    });

    return () => {
      mounted = false;
      sseConnection.close();
    };
  }, [symbol, maxTicks]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop } = scrollRef.current;
      setAutoScroll(scrollTop < 10);
    }
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };

  const getTickColor = (side?: 'buy' | 'sell') => {
    if (side === 'buy') return 'text-green-400';
    if (side === 'sell') return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-white">Time & Sales - {symbol}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-1 rounded ${
              autoScroll 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {autoScroll ? 'Auto' : 'Manual'}
          </button>
          <button
            onClick={() => setTicks([])}
            className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400 hover:bg-gray-600"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-semibold text-gray-400 bg-gray-800 border-b border-gray-700">
        <div>Time</div>
        <div className="text-right">Price</div>
        <div className="text-right">Size</div>
        <div className="text-center">Side</div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-sm"
      >
        {ticks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Waiting for ticks...
          </div>
        ) : (
          ticks.map((tick, i) => (
            <div
              key={`${tick.ts}-${i}`}
              className={`grid grid-cols-4 gap-2 px-3 py-1.5 border-b border-gray-800 hover:bg-gray-800/50 ${
                getTickColor(tick.side)
              }`}
            >
              <div className="text-xs text-gray-500 font-mono">
                {formatTime(tick.ts)}
              </div>
              <div className="text-right font-bold">
                ${tick.price.toFixed(2)}
              </div>
              <div className="text-right">
                {tick.size.toLocaleString()}
              </div>
              <div className="text-center text-xs">
                {tick.side === 'buy' ? '▲' : tick.side === 'sell' ? '▼' : '−'}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{ticks.length} tick{ticks.length !== 1 ? 's' : ''}</span>
          <div className="flex gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              Buy
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
              Sell
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
