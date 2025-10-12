// JSDOM is the environment; ensure a few APIs exist for components/services.

if (!('localStorage' in globalThis)) {
  const store = new Map<string,string>();
  // @ts-ignore
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } as Storage;
}

if (!('matchMedia' in globalThis)) {
  // @ts-ignore
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

// Voice/idle shims that may be referenced by the voice client
// @ts-ignore
if (!('IdleDetector' in globalThis)) globalThis.IdleDetector = class { start(){} stop(){} };
// @ts-ignore
if (!('AudioWorkletNode' in globalThis)) globalThis.AudioWorkletNode = class {};
// @ts-ignore
if (!('AudioContext' in globalThis)) globalThis.AudioContext = class { close(){} };

// Some libs check this
try {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
} catch {}
