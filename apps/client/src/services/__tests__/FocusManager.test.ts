import { describe, it, expect, beforeEach, vi } from "vitest";

import { FocusManager } from "../FocusManager";

describe("FocusManager", () => {
  let manager: FocusManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new FocusManager();
  });

  it("should start in normal mode", () => {
    expect(manager.getMode()).toBe("normal");
  });

  it("should hide rules/journal/memory in trade mode", () => {
    manager.setMode("trade");

    expect(manager.isPanelVisible("chart")).toBe(true);
    expect(manager.isPanelVisible("coach")).toBe(true);
    expect(manager.isPanelVisible("rules")).toBe(false);
    expect(manager.isPanelVisible("journal")).toBe(false);
    expect(manager.isPanelVisible("memory")).toBe(false);
  });

  it("should hide rules/coach in review mode", () => {
    manager.setMode("review");

    expect(manager.isPanelVisible("journal")).toBe(true);
    expect(manager.isPanelVisible("rules")).toBe(false);
    expect(manager.isPanelVisible("coach")).toBe(false);
  });

  it("should set opacity to 0.3 in trade mode", () => {
    manager.setMode("trade");
    expect(manager.getNonPriceOpacity()).toBe(0.3);
  });

  it("should freeze stream in review mode", () => {
    const mockListener = vi.fn();
    window.addEventListener("focus:freeze-stream", mockListener);

    manager.setMode("review");
    expect(mockListener).toHaveBeenCalled();
  });

  it("should persist mode to localStorage", () => {
    manager.setMode("trade");
    expect(localStorage.getItem("focus-mode")).toBe("trade");

    const newManager = new FocusManager();
    expect(newManager.getMode()).toBe("trade");
  });

  it("should toggle between modes", () => {
    expect(manager.getMode()).toBe("normal");

    manager.toggleTradeMode();
    expect(manager.getMode()).toBe("trade");

    manager.toggleTradeMode();
    expect(manager.getMode()).toBe("normal");
  });

  it("should notify subscribers on mode change", () => {
    const mockCallback = vi.fn();
    manager.subscribe(mockCallback);

    manager.setMode("trade");
    expect(mockCallback).toHaveBeenCalledWith("trade");
  });
});
