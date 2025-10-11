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
    <div className="bg-gray-800/50 px-3 py-2 rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-400">Signals</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setDensity('quiet')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${getDensityColor(
              'quiet'
            )}`}
            title="Quiet mode"
          >
            Q
          </button>
          <button
            onClick={() => setDensity('normal')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${getDensityColor(
              'normal'
            )}`}
            title="Normal mode"
          >
            N
          </button>
          <button
            onClick={() => setDensity('loud')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${getDensityColor(
              'loud'
            )}`}
            title="Loud mode"
          >
            L
          </button>
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`px-1.5 py-1 text-xs rounded transition-colors ${audioEnabled ? 'bg-blue-500/30 text-blue-400' : 'bg-gray-700/50 text-gray-500'}`}
            title={audioEnabled ? 'Audio alerts on' : 'Audio alerts off'}
          >
            {audioEnabled ? '🔔' : '🔕'}
          </button>
        </div>
      </div>
    </div>
  );
}
