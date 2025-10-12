// Ensure basic browser-ish APIs exist in jsdom
// localStorage (jsdom provides one, but guard just in case)
if (!('localStorage' in window)) {
  const store = new Map<string,string>();
  // @ts-ignore
  window.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } as Storage;
}

// matchMedia shim for components that query it
if (!('matchMedia' in window)) {
  // @ts-ignore
  window.matchMedia = (query: string) => ({
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

// IdleDetector / Audio APIs used by voice client
// @ts-ignore
if (!('IdleDetector' in window)) window.IdleDetector = class { start(){} stop(){} };
// @ts-ignore
if (!('AudioWorkletNode' in window)) window.AudioWorkletNode = class {};
// @ts-ignore
if (!('AudioContext' in window)) window.AudioContext = class { close(){} };

// Explicit document visibility (some components listen to it)
Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
