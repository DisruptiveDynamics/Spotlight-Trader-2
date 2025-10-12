// Tell app code we're under Vitest
process.env.VITEST = 'true';

// jsdom extras
if (!('matchMedia' in window)) {
  // @ts-expect-error
  window.matchMedia = (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; }
  });
}

if (!('ResizeObserver' in window)) {
  // @ts-expect-error
  window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
}

// crypto.getRandomValues shim (some libs need it)
if (!globalThis.crypto?.getRandomValues) {
  // @ts-expect-error
  globalThis.crypto = {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    },
  };
}

// Prevent real sockets/SSE in tests
class MockWebSocket {
  readyState = 0; url: string;
  onopen?: () => void; onclose?: () => void;
  onerror?: (e?: unknown) => void; onmessage?: (ev: {data: unknown}) => void;
  constructor(url: string){ this.url = url; setTimeout(()=>{ this.readyState = 1; this.onopen?.(); }, 0); }
  send(_d: unknown) {}
  close(){ this.readyState = 3; this.onclose?.(); }
  addEventListener(t:string, cb:any){ if(t==='open')this.onopen=cb; if(t==='close')this.onclose=cb; if(t==='error')this.onerror=cb; if(t==='message')this.onmessage=cb; }
  removeEventListener() {}
}
// @ts-expect-error
globalThis.WebSocket = globalThis.WebSocket ?? (MockWebSocket as any);

class MockEventSource {
  url: string; readyState = 1;
  onopen?: () => void; onerror?: (e?: unknown) => void; onmessage?: (ev:{data:string}) => void;
  constructor(url: string){ this.url = url; setTimeout(()=>this.onopen?.(), 0); }
  close(){ this.readyState = 2; }
  addEventListener(t:string, cb:any){ if(t==='open')this.onopen=cb; if(t==='error')this.onerror=cb; if(t==='message')this.onmessage=cb; }
  removeEventListener() {}
}
// @ts-expect-error
globalThis.EventSource = globalThis.EventSource ?? (MockEventSource as any);

// localStorage guard (jsdom has it, but just in case)
try { window.localStorage.setItem('__probe__','1'); window.localStorage.removeItem('__probe__'); }
catch {
  const store = new Map<string,string>();
  // @ts-expect-error
  window.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length(){ return store.size; }
  };
}
