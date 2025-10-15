 

// Vitest sets up jsdom for this project; we just polyfill a few gaps safely.

declare global {
  // minimal typings to make TS happy in tests
  interface Window {
    __TEST__?: boolean;
  }
}

globalThis.window ||= (globalThis as any).window;
globalThis.document ||= (globalThis as any).document;

// localStorage/sessionStorage (jsdom provides these when URL is set; guard anyway)
if (typeof window !== "undefined") {
  try {
    // Access to trigger construction; if it throws, we polyfill
    // @ts-expect-error: probing existence
    void window.localStorage;
  } catch {
    const store = () => {
      let s: Record<string, string> = {};
      return {
        getItem: (k: string) => (k in s ? s[k] : null),
        setItem: (k: string, v: string) => {
          s[k] = String(v);
        },
        removeItem: (k: string) => {
          delete s[k];
        },
        clear: () => {
          s = {};
        },
        key: (i: number) => Object.keys(s)[i] ?? null,
        get length() {
          return Object.keys(s).length;
        },
      };
    };
    // @ts-expect-error: define on window
    window.localStorage = store();
    // @ts-expect-error: define on window
    window.sessionStorage = store();
  }

  // matchMedia used by some components
  if (typeof window.matchMedia !== "function") {
    // @ts-expect-error: assign stub
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }

  // requestAnimationFrame
  if (typeof window.requestAnimationFrame !== "function") {
    // @ts-expect-error: assign stub
    window.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 16) as unknown as number;
    // @ts-expect-error: assign stub
    window.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as NodeJS.Timeout);
  }

  // AudioContext stub (some UI/voice code may touch it)
  // @ts-expect-error: loose stub is fine for tests
  window.AudioContext ||= class {
    close() {}
    resume() {}
    suspend() {}
  };

  // WebSocket/EventSource stubs if not present
  // @ts-expect-error
  window.WebSocket ||= class {};
  // @ts-expect-error
  window.EventSource ||= class {
    close() {}
  };

  // Navigator.connection or online status fallbacks used by latency HUDs
  // @ts-expect-error
  window.navigator ||= {};
  // @ts-expect-error
  window.navigator.onLine ??= true;
}

export {};
