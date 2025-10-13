/**
 * FPS (Frames Per Second) Probe
 * Lightweight rolling FPS measurement with React hook
 */

import { useState, useEffect } from "react";

interface FpsState {
  current: number;
  avg: number;
  min: number;
  max: number;
}

class FpsProbe {
  private frames: number[] = [];
  private lastTime: number = performance.now();
  private rafId: number | null = null;
  private windowSize: number = 60; // 1 second at 60fps
  private listeners: Set<(fps: FpsState) => void> = new Set();

  start() {
    if (this.rafId !== null) return;

    this.lastTime = performance.now();
    this.tick();
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = () => {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    if (delta > 0) {
      const fps = 1000 / delta;
      this.frames.push(fps);

      // Keep only last windowSize frames (rolling window)
      if (this.frames.length > this.windowSize) {
        this.frames.shift();
      }

      this.notifyListeners();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  getState(): FpsState {
    if (this.frames.length === 0) {
      return { current: 0, avg: 0, min: 0, max: 0 };
    }

    const current = this.frames[this.frames.length - 1] || 0;
    const sum = this.frames.reduce((a, b) => a + b, 0);
    const avg = sum / this.frames.length;
    const min = Math.min(...this.frames);
    const max = Math.max(...this.frames);

    return {
      current: Math.round(current),
      avg: Math.round(avg),
      min: Math.round(min),
      max: Math.round(max),
    };
  }

  subscribe(listener: (fps: FpsState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// Singleton instance
const fpsProbe = new FpsProbe();

// Auto-start on module load
fpsProbe.start();

/**
 * React hook to get current FPS state
 */
export function useFPS(): FpsState {
  const [fps, setFps] = useState<FpsState>(fpsProbe.getState());

  useEffect(() => {
    const unsubscribe = fpsProbe.subscribe(setFps);
    return unsubscribe;
  }, []);

  return fps;
}

/**
 * Report FPS to server
 */
export async function reportFPS(fps: number) {
  try {
    await fetch("/api/metrics/fps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fps }),
      credentials: "include",
    });
  } catch (error) {
    console.error("Failed to report FPS:", error);
  }
}

/**
 * Get current FPS state without hook
 */
export function getFPS(): FpsState {
  return fpsProbe.getState();
}
