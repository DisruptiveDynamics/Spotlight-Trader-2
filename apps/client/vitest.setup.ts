import { vi } from "vitest";

/** Ensure we're in jsdom */
if (typeof window === "undefined") {
  throw new Error("jsdom environment not active for client tests.");
}

/** localStorage mock (kept simple and standards-ish) */
class LocalStorageMock {
  private store = new Map<string, string>();
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(String(k), String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

Object.defineProperty(window, "localStorage", {
  value: new LocalStorageMock(),
  writable: true,
});

/** requestAnimationFrame */
if (!("requestAnimationFrame" in window)) {
  // @ts-expect-error - requestAnimationFrame not available in test environment, using setTimeout polyfill
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0);
}

/** matchMedia */
if (!("matchMedia" in window)) {
  // @ts-expect-error - matchMedia not available in jsdom, using vi.fn mock implementation
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Defensive no-op EventSource & WebSocket so tests don't bind real ports */
if (!("EventSource" in window)) {
  // @ts-expect-error - EventSource not available in jsdom, using mock implementation for tests
  window.EventSource = class {
    url: string;
    onopen: ((this: EventSource, ev: Event) => any) | null = null;
    onmessage: ((this: EventSource, ev: MessageEvent) => any) | null = null;
    onerror: ((this: EventSource, ev: Event) => any) | null = null;
    readyState = 0;
    constructor(url: string) {
      this.url = url;
    }
    close() {
      this.readyState = 2;
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
  };
}

if (!("WebSocket" in window)) {
  // @ts-expect-error - WebSocket not available in jsdom, using mock implementation for tests
  window.WebSocket = class {
    url: string;
    readyState = 1;
    onopen: ((this: WebSocket, ev: Event) => any) | null = null;
    onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
    onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
    onerror: ((this: WebSocket, ev: Event) => any) | null = null;
    constructor(url: string) {
      this.url = url;
      queueMicrotask(() => this.onopen?.(new Event("open")));
    }
    send() {}
    close() {
      this.readyState = 3;
      this.onclose?.(new Event("close") as any);
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
  } as any;
}

/** Flag code paths to avoid real network / servers during tests */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.VITEST = "true";
process.env.DISABLE_REAL_SOCKETS = "true";
