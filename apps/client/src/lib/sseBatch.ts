// Batch SSE updates for smooth rendering
let queue: any[] = [];
let scheduled = false;

export function batchBars<T>(bar: T, apply: (batch: T[]) => void) {
  queue.push(bar);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    const batch = queue;
    queue = [];
    scheduled = false;
    apply(batch);
  });
}
