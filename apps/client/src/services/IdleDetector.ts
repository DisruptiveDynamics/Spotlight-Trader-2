/**
 * IdleDetector - Manages voice coach sleep/wake based on user activity
 * Saves tokens by closing connections after 30 minutes of inactivity
 */

export type IdleCallback = () => void;

export class IdleDetector {
  private idleTimer: number | null = null;
  private idleTimeoutMs: number;
  private onIdleCallback: IdleCallback | null = null;
  private isActive = false;

  constructor(idleTimeoutMs = 30 * 60 * 1000) {
    this.idleTimeoutMs = idleTimeoutMs;
  }

  start(onIdle: IdleCallback): void {
    this.onIdleCallback = onIdle;
    this.isActive = true;

    // Listen to user activity events
    window.addEventListener("mousemove", this.resetIdle);
    window.addEventListener("mousedown", this.resetIdle);
    window.addEventListener("keydown", this.resetIdle);
    window.addEventListener("touchstart", this.resetIdle);
    window.addEventListener("scroll", this.resetIdle);

    // Start idle timer
    this.resetIdle();
  }

  stop(): void {
    this.isActive = false;

    // Clear timer
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Remove event listeners
    window.removeEventListener("mousemove", this.resetIdle);
    window.removeEventListener("mousedown", this.resetIdle);
    window.removeEventListener("keydown", this.resetIdle);
    window.removeEventListener("touchstart", this.resetIdle);
    window.removeEventListener("scroll", this.resetIdle);

    this.onIdleCallback = null;
  }

  private resetIdle = (): void => {
    if (!this.isActive) return;

    // Clear existing timer
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }

    // Start new idle countdown
    this.idleTimer = window.setTimeout(() => {
      if (this.onIdleCallback) {
        console.log("🔕 User idle - Voice Coach entering sleep mode");
        this.onIdleCallback();
      }
    }, this.idleTimeoutMs);
  };

  forceIdle(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.onIdleCallback) {
      this.onIdleCallback();
    }
  }
}

// Global singleton instance
let globalIdleDetector: IdleDetector | null = null;

export function getIdleDetector(): IdleDetector {
  if (!globalIdleDetector) {
    globalIdleDetector = new IdleDetector();
  }
  return globalIdleDetector;
}
