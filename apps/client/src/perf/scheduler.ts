/**
 * Performance Scheduler
 * Request Animation Frame-based scheduling with FPS limiting
 */

type ScheduledTask = () => void;

let rafId: number | null = null;
let pendingTasks: Set<ScheduledTask> = new Set();

/**
 * Schedule a task to run on the next animation frame
 * Coalesces multiple calls into a single rAF
 */
export function schedule(fn: ScheduledTask): void {
  pendingTasks.add(fn);

  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      const tasks = Array.from(pendingTasks);
      pendingTasks.clear();
      rafId = null;

      // Execute all pending tasks in batch
      tasks.forEach((task) => {
        try {
          task();
        } catch (error) {
          console.error('Scheduled task error:', error);
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
  maxFps: number
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
  fn: T
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
