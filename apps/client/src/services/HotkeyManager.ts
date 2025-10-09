type HotkeyCallback = (event: KeyboardEvent) => void;

interface HotkeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: HotkeyCallback;
  description: string;
  sequence?: boolean;
}

export class HotkeyManager {
  private bindings: Map<string, HotkeyBinding> = new Map();
  private sequenceBuffer: string[] = [];
  private sequenceTimeout: NodeJS.Timeout | null = null;
  private enabled = true;

  constructor() {
    this.setupDefaultBindings();
    this.attachListeners();
  }

  private setupDefaultBindings() {
    this.register({
      key: 't',
      description: 'Push-to-talk (hold on mobile, toggle on desktop)',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:push-to-talk'));
      },
    });

    this.register({
      key: ' ',
      description: 'Pause/resume live stream',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:toggle-stream'));
      },
    });

    this.register({
      key: 'a',
      description: 'Set alert at cursor price',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:set-alert'));
      },
    });

    this.register({
      key: 'j',
      description: 'New journal note',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:new-journal'));
      },
    });

    this.register({
      key: 'g',
      sequence: true,
      description: 'VWAP anchor sequence (g+v)',
      callback: () => {
        this.startSequence('g');
      },
    });

    this.register({
      key: '1',
      description: 'Switch to 1m timeframe',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:timeframe', { detail: '1m' }));
      },
    });

    this.register({
      key: '2',
      description: 'Switch to 5m timeframe',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:timeframe', { detail: '5m' }));
      },
    });

    this.register({
      key: '3',
      description: 'Switch to 15m timeframe',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:timeframe', { detail: '15m' }));
      },
    });

    this.register({
      key: 'k',
      meta: true,
      description: 'Command palette',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:command-palette'));
      },
    });

    this.register({
      key: 'k',
      ctrl: true,
      description: 'Command palette',
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hotkey:command-palette'));
      },
    });
  }

  private startSequence(key: string) {
    this.sequenceBuffer = [key];

    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    this.sequenceTimeout = setTimeout(() => {
      this.sequenceBuffer = [];
    }, 1000);
  }

  private attachListeners() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!this.enabled) return;

    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (this.sequenceBuffer.length > 0) {
      this.handleSequence(event);
      return;
    }

    const key = event.key.toLowerCase();
    const bindingKey = this.getBindingKey(event);
    const binding = this.bindings.get(bindingKey);

    if (binding) {
      binding.callback(event);
    }
  }

  private handleSequence(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    const sequence = [...this.sequenceBuffer, key].join('+');

    if (sequence === 'g+v') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('hotkey:toggle-vwap'));
      this.sequenceBuffer = [];
      if (this.sequenceTimeout) {
        clearTimeout(this.sequenceTimeout);
      }
    } else {
      this.sequenceBuffer.push(key);
    }
  }

  private getBindingKey(event: KeyboardEvent): string {
    const parts: string[] = [];

    if (event.ctrlKey) parts.push('ctrl');
    if (event.metaKey) parts.push('meta');
    if (event.shiftKey) parts.push('shift');
    if (event.altKey) parts.push('alt');

    parts.push(event.key.toLowerCase());

    return parts.join('+');
  }

  register(binding: HotkeyBinding) {
    const key = this.getKeyString(binding);
    this.bindings.set(key, binding);
  }

  private getKeyString(binding: HotkeyBinding): string {
    const parts: string[] = [];

    if (binding.ctrl) parts.push('ctrl');
    if (binding.meta) parts.push('meta');
    if (binding.shift) parts.push('shift');
    if (binding.alt) parts.push('alt');

    parts.push(binding.key.toLowerCase());

    return parts.join('+');
  }

  unregister(key: string) {
    this.bindings.delete(key);
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  getBindings(): Array<{ key: string; description: string }> {
    return Array.from(this.bindings.values()).map((binding) => ({
      key: this.getKeyString(binding),
      description: binding.description,
    }));
  }

  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }
  }
}

export const hotkeyManager = new HotkeyManager();
