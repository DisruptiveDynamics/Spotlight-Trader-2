import { vi } from 'vitest';

/**
 * ---- SAFETY MOCKS (both environments) ----
 * Prevent any test from binding real sockets or ports.
 */
vi.mock('ws', () => {
  class WebSocketMock {
    url: string;
    constructor(url?: string) { this.url = url ?? ''; }
    close() {}
    send() {}
    on() {}
    addEventListener() {}
    removeEventListener() {}
  }
  class WebSocketServerMock {
    constructor(..._args: any[]) {}
    on() {}
    close() {}
    address() { return { port: 0 }; }
  }
  return {
    default: WebSocketMock,
    WebSocket: WebSocketMock,
    WebSocketServer: WebSocketServerMock,
    Server: WebSocketServerMock,
  };
});

// Some libraries might import eventsource directly in Node
vi.mock('eventsource', () => {
  return { default: class { constructor(_url: string) {} close() {} } };
});

/**
 * ---- JSDOM-ONLY POLYFILLS ----
 * Only run these when JSDOM is actually active.
 */
const isJsdom = typeof window !== 'undefined' && typeof document !== 'undefined';

// localStorage
if (isJsdom && !('localStorage' in window)) {
  class LocalStorageMock {
    private store = new Map<string, string>();
    clear() { this.store.clear(); }
    getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
    setItem(k: string, v: string) { this.store.set(String(k), String(v)); }
    removeItem(k: string) { this.store.delete(k); }
    key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
    get length() { return this.store.size; }
  }
  Object.defineProperty(window, 'localStorage', { value: new LocalStorageMock(), configurable: true });
}

// requestAnimationFrame
if (isJsdom && !('requestAnimationFrame' in window)) {
  // @ts-expect-error polyfill for tests
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0);
}

// matchMedia
if (isJsdom && !('matchMedia' in window)) {
  // @ts-expect-error polyfill for tests
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Guard rails for client code that checks these flags
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.VITEST = 'true';
process.env.DISABLE_REAL_SOCKETS = 'true';
