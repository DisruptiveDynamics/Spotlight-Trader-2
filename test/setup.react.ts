// Ensure React Testing Library can use act() under Vitest without tripping prod guard
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Provide a deterministic origin for relative fetch URLs in tests
// Vitest/undici requires absolute URLs; we rewrite "/api/..." to "http://localhost/api/..."
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  try {
    if (typeof input === "string" && input.startsWith("/")) {
      input = "http://localhost" + input;
    } else if (input instanceof URL && input.pathname?.startsWith?.("/")) {
      input = new URL(input.pathname + input.search, "http://localhost");
    }
  } catch {
    // no-op; fall back to original
  }
  return originalFetch(input as any, init);
}) as any;

// JSDOM lacks some browser APIs used by UI; stub if needed:
if (!(globalThis as any).matchMedia) {
  (globalThis as any).matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    media: "",
    onchange: null,
  });
}
