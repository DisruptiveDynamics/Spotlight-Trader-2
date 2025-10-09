import { useState, useEffect } from 'react';

type DensityLevel = 'quiet' | 'normal' | 'loud';

interface DensityConfig {
  minConfidence: number;
  requireRegimeAlign: boolean;
  requireTapeConfirm: boolean;
  maxConcurrentSignals: number;
}

const DENSITY_CONFIGS: Record<DensityLevel, DensityConfig> = {
  quiet: {
    minConfidence: 0.75,
    requireRegimeAlign: true,
    requireTapeConfirm: true,
    maxConcurrentSignals: 1,
  },
  normal: {
    minConfidence: 0.6,
    requireRegimeAlign: true,
    requireTapeConfirm: false,
    maxConcurrentSignals: 3,
  },
  loud: {
    minConfidence: 0.5,
    requireRegimeAlign: false,
    requireTapeConfirm: false,
    maxConcurrentSignals: 5,
  },
};

export function SignalDensityControl() {
  const [density, setDensity] = useState<DensityLevel>('normal');
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('signal-density');
    if (saved && (saved === 'quiet' || saved === 'normal' || saved === 'loud')) {
      setDensity(saved);
    }

    const audioSaved = localStorage.getItem('signal-audio');
    if (audioSaved !== null) {
      setAudioEnabled(audioSaved === 'true');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('signal-density', density);
    window.dispatchEvent(
      new CustomEvent('signal:density-change', {
        detail: DENSITY_CONFIGS[density],
      })
    );
  }, [density]);

  useEffect(() => {
    localStorage.setItem('signal-audio', String(audioEnabled));
    
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setAudioEnabled(false);
    }
  }, [audioEnabled]);

  const getDensityColor = (level: DensityLevel) => {
    if (density === level) {
      if (level === 'quiet') return 'bg-blue-500';
      if (level === 'normal') return 'bg-green-500';
      return 'bg-amber-500';
    }
    return 'bg-gray-700';
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Signal Density</h3>
        <button
          onClick={() => setAudioEnabled(!audioEnabled)}
          className={`px-2 py-1 text-xs rounded ${
            audioEnabled ? 'bg-blue-500' : 'bg-gray-700'
          }`}
          title={audioEnabled ? 'Audio alerts on' : 'Audio alerts off'}
        >
          {audioEnabled ? '🔔' : '🔕'}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setDensity('quiet')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${getDensityColor(
            'quiet'
          )}`}
        >
          Quiet
        </button>
        <button
          onClick={() => setDensity('normal')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${getDensityColor(
            'normal'
          )}`}
        >
          Normal
        </button>
        <button
          onClick={() => setDensity('loud')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${getDensityColor(
            'loud'
          )}`}
        >
          Loud
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        <div>Min confidence: {(DENSITY_CONFIGS[density].minConfidence * 100).toFixed(0)}%</div>
        <div>Max signals: {DENSITY_CONFIGS[density].maxConcurrentSignals}</div>
        {density === 'quiet' && <div className="text-blue-400 mt-1">Top opportunity only</div>}
      </div>
    </div>
  );
}
