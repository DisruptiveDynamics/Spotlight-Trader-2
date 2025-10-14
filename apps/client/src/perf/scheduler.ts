/**
 * Performance Scheduler
 * Request Animation Frame-based scheduling with FPS limiting and tab visibility detection
 * 
 * Adaptive FPS:
 * - Visible tab: 60 FPS (smooth animations)
 * - Hidden tab: 15 FPS (reduce CPU usage)
 */

type ScheduledTask = () => void;

let rafId: number | null = null;
const pendingTasks: Set<ScheduledTask> = new Set();

// Tab visibility state (default to visible in non-DOM contexts)
let isTabVisible = typeof document !== 'undefined' ? !document.hidden : true;
let currentMaxFps = isTabVisible ? 60 : 15;
let lastFrameTime = 0;

// Listen for visibility changes (browser only)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    currentMaxFps = isTabVisible ? 60 : 15;
    console.log(`[Scheduler] Tab ${isTabVisible ? 'visible' : 'hidden'}, FPS limit: ${currentMaxFps}`);
  });
}

/**
 * Schedule a task to run on the next animation frame with FPS throttling
 * Coalesces multiple calls into a single rAF
 * Respects adaptive FPS limits based on tab visibility
 */
export function schedule(fn: ScheduledTask): void {
  pendingTasks.add(fn);

  if (rafId === null) {
    rafId = requestAnimationFrame((timestamp) => {
      const minFrameInterval = 1000 / currentMaxFps;
      const elapsed = timestamp - lastFrameTime;

      // Throttle based on current FPS limit
      if (elapsed < minFrameInterval) {
        // Too soon, reschedule
        rafId = null;
        schedule(fn);
        return;
      }

      lastFrameTime = timestamp;
      const tasks = Array.from(pendingTasks);
      pendingTasks.clear();
      rafId = null;

      // Execute all pending tasks in batch
      tasks.forEach((task) => {
        try {
          task();
        } catch (error) {
          console.error("Scheduled task error:", error);
        }
      });
    });
  }
}

/**
 * Create an FPS-limited wrapper for a function
 * Ensures the function runs at most `maxFps` times per second
 */
export function limitFps<T extends (...args: any[]) => void>(
  maxFps: number,
): (fn: T) => (...args: Parameters<T>) => void {
  const minInterval = 1000 / maxFps;
  let lastRun = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return (fn: T) => {
    return (...args: Parameters<T>) => {
      const now = performance.now();
      const elapsed = now - lastRun;

      if (elapsed >= minInterval) {
        // Enough time has passed, run immediately
        lastRun = now;
        fn(...args);
      } else if (!timeoutId) {
        // Schedule for next available slot
        const remaining = minInterval - elapsed;
        timeoutId = setTimeout(() => {
          lastRun = performance.now();
          timeoutId = null;
          fn(...args);
        }, remaining);
      }
    };
  };
}

/**
 * Debounce a function to run at most once per animation frame
 */
export function debounceRaf<T extends (...args: any[]) => void>(
  fn: T,
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let latestArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    latestArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (latestArgs) {
          fn(...latestArgs);
          latestArgs = null;
        }
      });
    }
  };
}

/**
 * Cancel all pending scheduled tasks
 */
export function cancelScheduled(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingTasks.clear();
}

/**
 * Get current tab visibility state
 */
export function isVisible(): boolean {
  return isTabVisible;
}

/**
 * Get current FPS limit
 */
export function getCurrentFpsLimit(): number {
  return currentMaxFps;
}

/**
 * Create a coalescing batch updater for high-frequency updates
 * Useful for microbar batching - collects multiple updates and applies once per frame
 * 
 * @param batchHandler - Function that receives all batched items
 * @returns Function to add items to the batch
 */
export function createBatchCoalescer<T>(
  batchHandler: (items: T[]) => void,
): (item: T) => void {
  const batchQueue: T[] = [];
  let scheduled = false;

  return (item: T) => {
    batchQueue.push(item);

    if (!scheduled) {
      scheduled = true;
      schedule(() => {
        if (batchQueue.length > 0) {
          const batch = [...batchQueue];
          batchQueue.length = 0;
          batchHandler(batch);
        }
        scheduled = false;
      });
    }
  };
}
