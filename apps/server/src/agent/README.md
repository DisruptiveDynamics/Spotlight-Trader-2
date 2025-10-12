# Spotlight Trader — Agent Module (opt-in, safe by default)

- No routes, no ports, no side effects.
- If you don't import from `apps/server/src/agent`, the app behaves exactly as before.

## What’s here
- `tools.ts`: JSON-schema-like tool definitions + safe placeholder handlers
- `context.ts`: `composeMiniContext()` helper to keep per-turn context tiny
- `assistant-system-prompt.md`: drop-in system prompt

## Wiring (later, when ready)
1. Add the `ToolSchemas` to your Assistant/Responses client (OpenAI tool/function calling).
2. Map tool calls by name to `ToolHandlers[name]`.
3. Prepend `composeMiniContext({...})` to the user's content each turn with a *small* rolling snapshot
   (symbol/timeframe, last action, HUD, constraints).
4. Replace placeholder returns in handlers with real data sources (DB/ring buffer/rules store).

This keeps the agent predictable, private, and cheap. If not wired, the agent will explicitly
ask you to call a tool and won't hallucinate internal data.
