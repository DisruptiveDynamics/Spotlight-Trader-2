type FocusMode = 'normal' | 'trade' | 'review';

interface FocusModeConfig {
  mode: FocusMode;
  hiddenPanels: string[];
  streamFrozen: boolean;
  opacity: number;
}

const FOCUS_CONFIGS: Record<FocusMode, FocusModeConfig> = {
  normal: {
    mode: 'normal',
    hiddenPanels: [],
    streamFrozen: false,
    opacity: 1,
  },
  trade: {
    mode: 'trade',
    hiddenPanels: ['rules', 'journal', 'memory'],
    streamFrozen: false,
    opacity: 0.3,
  },
  review: {
    mode: 'review',
    hiddenPanels: ['rules', 'coach'],
    streamFrozen: true,
    opacity: 1,
  },
};

export class FocusManager {
  private currentMode: FocusMode = 'normal';
  private listeners: Set<(mode: FocusMode) => void> = new Set();

  constructor() {
    this.loadMode();
  }

  private loadMode() {
    const saved = localStorage.getItem('focus-mode');
    if (saved && (saved === 'normal' || saved === 'trade' || saved === 'review')) {
      this.currentMode = saved;
    }
  }

  private saveMode() {
    localStorage.setItem('focus-mode', this.currentMode);
  }

  setMode(mode: FocusMode) {
    this.currentMode = mode;
    this.saveMode();
    this.notifyListeners();
    
    const config = FOCUS_CONFIGS[mode];
    
    if (config.streamFrozen) {
      window.dispatchEvent(new CustomEvent('focus:freeze-stream'));
    } else {
      window.dispatchEvent(new CustomEvent('focus:unfreeze-stream'));
    }
  }

  getMode(): FocusMode {
    return this.currentMode;
  }

  getConfig(): FocusModeConfig {
    return FOCUS_CONFIGS[this.currentMode];
  }

  isPanelVisible(panelId: string): boolean {
    const config = this.getConfig();
    return !config.hiddenPanels.includes(panelId);
  }

  getNonPriceOpacity(): number {
    return this.getConfig().opacity;
  }

  toggleTradeMode() {
    this.setMode(this.currentMode === 'trade' ? 'normal' : 'trade');
  }

  toggleReviewMode() {
    this.setMode(this.currentMode === 'review' ? 'normal' : 'review');
  }

  subscribe(callback: (mode: FocusMode) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach((callback) => callback(this.currentMode));
  }
}

export const focusManager = new FocusManager();
