import { useState, useEffect } from 'react';

interface TapeMetrics {
  volumeZ: number;
  uptickDelta: number;
  spreadBp: number;
}

export function TapePeek() {
  const [isOpen, setIsOpen] = useState(false);
  const [metrics, setMetrics] = useState<TapeMetrics>({
    volumeZ: 0,
    uptickDelta: 0,
    spreadBp: 0,
  });

  useEffect(() => {
    const handleUpdate = (e: CustomEvent<TapeMetrics>) => {
      setMetrics(e.detail);
    };

    window.addEventListener('tape:update' as any, handleUpdate);
    return () => window.removeEventListener('tape:update' as any, handleUpdate);
  }, []);

  const getVolumeZColor = (z: number) => {
    if (z > 2) return 'text-green-400';
    if (z < -2) return 'text-red-400';
    return 'text-gray-400';
  };

  const getUptickColor = (delta: number) => {
    if (delta > 100) return 'text-green-400';
    if (delta < -100) return 'text-red-400';
    return 'text-gray-400';
  };

  const getSpreadColor = (bp: number) => {
    if (bp < 5) return 'text-green-400';
    if (bp < 10) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div
      className={`fixed right-0 top-1/2 -translate-y-1/2 transition-transform ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 bg-gray-800 p-2 rounded-l-lg border border-r-0 border-gray-700 hover:bg-gray-700"
      >
        <span className="text-xs">{isOpen ? '→' : '←'}</span>
      </button>

      <div className="bg-gray-800 border-l border-gray-700 p-4 w-48 space-y-4">
        <h3 className="text-sm font-semibold text-white mb-3">Tape</h3>

        <div>
          <div className="text-xs text-gray-400 mb-1">Volume Z-Score (2m)</div>
          <div className={`text-lg font-mono font-bold ${getVolumeZColor(metrics.volumeZ)}`}>
            {metrics.volumeZ.toFixed(2)}σ
          </div>
          <div className="mt-1 h-2 bg-gray-700 rounded overflow-hidden">
            <div
              className={`h-full ${metrics.volumeZ > 0 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{
                width: `${Math.min(Math.abs(metrics.volumeZ) * 20, 100)}%`,
              }}
            />
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 mb-1">Uptick Delta</div>
          <div className={`text-lg font-mono font-bold ${getUptickColor(metrics.uptickDelta)}`}>
            {metrics.uptickDelta > 0 ? '+' : ''}
            {metrics.uptickDelta}
          </div>
          <svg width="100%" height="30" className="mt-1">
            <polyline
              points="0,15 20,12 40,18 60,10 80,14 100,8 120,15 140,11 160,16 180,13"
              fill="none"
              stroke={metrics.uptickDelta > 0 ? '#10b981' : '#ef4444'}
              strokeWidth="2"
            />
          </svg>
        </div>

        <div>
          <div className="text-xs text-gray-400 mb-1">Spread</div>
          <div className={`text-lg font-mono font-bold ${getSpreadColor(metrics.spreadBp)}`}>
            {metrics.spreadBp.toFixed(1)} bp
          </div>
          <div
            className={`mt-1 px-2 py-0.5 text-xs rounded ${
              metrics.spreadBp < 5
                ? 'bg-green-500/20 text-green-400'
                : metrics.spreadBp < 10
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-red-500/20 text-red-400'
            }`}
          >
            {metrics.spreadBp < 5 ? 'Tight' : metrics.spreadBp < 10 ? 'Normal' : 'Wide'}
          </div>
        </div>
      </div>
    </div>
  );
}
