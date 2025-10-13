import { describe, it, expect, beforeEach, vi } from "vitest";
import { HotkeyManager } from "../HotkeyManager";

describe("HotkeyManager", () => {
  let manager: HotkeyManager;
  let mockEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new HotkeyManager();
    mockEventListener = vi.fn();
  });

  it("should register default hotkeys", () => {
    const bindings = manager.getBindings();

    expect(bindings.length).toBeGreaterThan(0);
    expect(bindings.some((b) => b.key === "t")).toBe(true);
    expect(bindings.some((b) => b.key === " ")).toBe(true);
    expect(bindings.some((b) => b.key === "a")).toBe(true);
  });

  it("should dispatch custom events for hotkeys", () => {
    window.addEventListener("hotkey:push-to-talk", mockEventListener);

    const event = new KeyboardEvent("keydown", { key: "t" });
    document.dispatchEvent(event);

    expect(mockEventListener).toHaveBeenCalled();
  });

  it("should handle keyboard sequences (g+v)", () => {
    window.addEventListener("hotkey:toggle-vwap", mockEventListener);

    const eventG = new KeyboardEvent("keydown", { key: "g" });
    document.dispatchEvent(eventG);

    const eventV = new KeyboardEvent("keydown", { key: "v" });
    document.dispatchEvent(eventV);

    expect(mockEventListener).toHaveBeenCalled();
  });

  it("should ignore hotkeys when input is focused", () => {
    window.addEventListener("hotkey:push-to-talk", mockEventListener);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "t", bubbles: true });
    input.dispatchEvent(event);

    expect(mockEventListener).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("should support enable/disable", () => {
    window.addEventListener("hotkey:push-to-talk", mockEventListener);

    manager.disable();
    const event = new KeyboardEvent("keydown", { key: "t" });
    document.dispatchEvent(event);
    expect(mockEventListener).not.toHaveBeenCalled();

    manager.enable();
    document.dispatchEvent(event);
    expect(mockEventListener).toHaveBeenCalled();
  });

  it("should handle command palette shortcut (Cmd+K)", () => {
    window.addEventListener("hotkey:command-palette", mockEventListener);

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    document.dispatchEvent(event);

    expect(mockEventListener).toHaveBeenCalled();
  });
});
