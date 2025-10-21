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

function isEditable(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
}

export class HotkeyManager {
  private bindings: Map<string, HotkeyBinding> = new Map();
  private sequenceBuffer: string[] = [];
  private sequenceTimeout: NodeJS.Timeout | null = null;
  private enabled = true;

  // Single shared document listener that dispatches only to the latest instance
  private static active: HotkeyManager | null = null;
  private static listenerAttached = false;

  constructor() {
    this.setupDefaultBindings();
    HotkeyManager.active = this;
    if (!HotkeyManager.listenerAttached) {
      document.addEventListener("keydown", HotkeyManager.globalKeydownHandler);
      HotkeyManager.listenerAttached = true;
    }
  }

  // Global dispatcher -> forwards to current active instance
  private static globalKeydownHandler = (event: KeyboardEvent) => {
    HotkeyManager.active?._handleKeyDown(event);
  };

  private setupDefaultBindings() {
    this.register({
      key: "t",
      description: "Push-to-talk (hold on mobile, toggle on desktop)",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:push-to-talk"));
      },
    });

    this.register({
      key: " ",
      description: "Pause/resume live stream",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:toggle-stream"));
      },
    });

    this.register({
      key: "a",
      description: "Set alert at cursor price",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:set-alert"));
      },
    });

    this.register({
      key: "j",
      description: "New journal note",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:new-journal"));
      },
    });

    // Sequence starter: g
    this.register({
      key: "g",
      sequence: true,
      description: "VWAP anchor sequence (g+v)",
      callback: () => {
        this.startSequence("g");
      },
    });

    // Timeframe switches
    this.register({
      key: "1",
      description: "Switch to 1m timeframe",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:timeframe", { detail: "1m" }));
      },
    });
    this.register({
      key: "2",
      description: "Switch to 5m timeframe",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:timeframe", { detail: "5m" }));
      },
    });
    this.register({
      key: "3",
      description: "Switch to 15m timeframe",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:timeframe", { detail: "15m" }));
      },
    });

    // Command palette
    this.register({
      key: "k",
      meta: true,
      description: "Command palette",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:command-palette"));
      },
    });
    this.register({
      key: "k",
      ctrl: true,
      description: "Command palette",
      callback: (e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hotkey:command-palette"));
      },
    });
  }

  private startSequence(key: string) {
    this.sequenceBuffer = [key.toLowerCase()];
    if (this.sequenceTimeout) clearTimeout(this.sequenceTimeout);
    this.sequenceTimeout = setTimeout(() => {
      this.sequenceBuffer = [];
      this.sequenceTimeout = null;
    }, 1000);
  }

  // Instance-level handler invoked by the global dispatcher
  private _handleKeyDown(event: KeyboardEvent) {
    if (!this.enabled) return;
    if (isEditable(document.activeElement)) return;

    const key = event.key.toLowerCase();

    // Sequence handling: g+v => hotkey:toggle-vwap (as tests expect)
    if (this.sequenceBuffer.length > 0) {
      const seq = this.sequenceBuffer.join("") + key;
      if (seq === "gv") {
        window.dispatchEvent(new CustomEvent("hotkey:toggle-vwap"));
        this.sequenceBuffer = [];
        if (this.sequenceTimeout) {
          clearTimeout(this.sequenceTimeout);
          this.sequenceTimeout = null;
        }
        return;
      }
    }

    for (const binding of this.bindings.values()) {
      if (
        binding.key.toLowerCase() === key &&
        (!!binding.ctrl === !!event.ctrlKey) &&
        (!!binding.meta === !!event.metaKey) &&
        (!!binding.shift === !!event.shiftKey) &&
        (!!binding.alt === !!event.altKey)
      ) {
        if (binding.sequence) {
          this.startSequence(binding.key.toLowerCase());
          return;
        }
        binding.callback(event);
        return;
      }
    }
  }

  public register(binding: HotkeyBinding) {
    const id = [
      binding.key.toLowerCase(),
      binding.ctrl ? "ctrl" : "",
      binding.meta ? "meta" : "",
      binding.shift ? "shift" : "",
      binding.alt ? "alt" : "",
      binding.sequence ? "seq" : "",
    ]
      .filter(Boolean)
      .join("+");

    this.bindings.set(id, binding);
  }

  public enable() {
    this.enabled = true;
    // Set this instance as active so tests operate on the latest object
    HotkeyManager.active = this;
  }

  public disable() {
    this.enabled = false;
    this.sequenceBuffer = [];
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
      this.sequenceTimeout = null;
    }
  }

  // Expose for tests
  public getBindings() {
    return Array.from(this.bindings.values());
  }
}
