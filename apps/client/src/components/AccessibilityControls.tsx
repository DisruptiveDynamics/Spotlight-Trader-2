import { useState, useEffect } from 'react';

type ColorVisionPreset = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

const COLOR_PALETTES: Record<ColorVisionPreset, { up: string; down: string; neutral: string }> = {
  normal: {
    up: '#10b981',
    down: '#ef4444',
    neutral: '#6b7280',
  },
  protanopia: {
    up: '#3b82f6',
    down: '#eab308',
    neutral: '#6b7280',
  },
  deuteranopia: {
    up: '#3b82f6',
    down: '#f59e0b',
    neutral: '#6b7280',
  },
  tritanopia: {
    up: '#06b6d4',
    down: '#f43f5e',
    neutral: '#6b7280',
  },
};

export function AccessibilityControls() {
  const [colorVision, setColorVision] = useState<ColorVisionPreset>('normal');
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const savedVision = localStorage.getItem('color-vision');
    if (
      savedVision &&
      (savedVision === 'normal' ||
        savedVision === 'protanopia' ||
        savedVision === 'deuteranopia' ||
        savedVision === 'tritanopia')
    ) {
      setColorVision(savedVision);
    }

    const savedContrast = localStorage.getItem('high-contrast');
    if (savedContrast !== null) {
      setHighContrast(savedContrast === 'true');
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(prefersReducedMotion);
  }, []);

  useEffect(() => {
    localStorage.setItem('color-vision', colorVision);
    const palette = COLOR_PALETTES[colorVision];

    document.documentElement.style.setProperty('--color-up', palette.up);
    document.documentElement.style.setProperty('--color-down', palette.down);
    document.documentElement.style.setProperty('--color-neutral', palette.neutral);
  }, [colorVision]);

  useEffect(() => {
    localStorage.setItem('high-contrast', String(highContrast));

    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }, [highContrast]);

  return (
    <div className="bg-gray-800 p-4 rounded-lg space-y-4">
      <h3 className="text-sm font-semibold text-white">Accessibility</h3>

      <div>
        <label className="block text-xs text-gray-400 mb-2">Color Vision</label>
        <select
          value={colorVision}
          onChange={(e) => setColorVision(e.target.value as ColorVisionPreset)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
        >
          <option value="normal">Normal</option>
          <option value="protanopia">Protanopia (Red-blind)</option>
          <option value="deuteranopia">Deuteranopia (Green-blind)</option>
          <option value="tritanopia">Tritanopia (Blue-blind)</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">High Contrast</span>
        <button
          onClick={() => setHighContrast(!highContrast)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            highContrast ? 'bg-blue-500' : 'bg-gray-700'
          }`}
        >
          <div
            className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
              highContrast ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {reducedMotion && (
        <div className="text-xs text-gray-400 bg-gray-700/50 p-2 rounded">
          Animations disabled (system preference)
        </div>
      )}
    </div>
  );
}
