import type { Response } from "express";

interface BufferedEvent {
  id?: string;
  event: string;
  data: string;
  timestamp: number;
}

export class BackpressureController {
  private buffer: BufferedEvent[] = [];
  private readonly maxSize: number;
  private isPaused = false;
  private droppedCount = 0;
  private drainHandler: () => void;

  constructor(
    private res: Response,
    maxSize = 100,
  ) {
    this.maxSize = maxSize;

    this.drainHandler = () => this.handleDrain();
    res.on("drain", this.drainHandler);
  }

  write(event: string, data: any, id?: string): void {
    const bufferedEvent: BufferedEvent = {
      event,
      data: JSON.stringify(data),
      timestamp: Date.now(),
      ...(id && { id: String(id) }),
    };

    if (this.buffer.length > 0 || this.isPaused) {
      if (this.buffer.length >= this.maxSize) {
        this.dropEvent(bufferedEvent);
      } else {
        this.buffer.push(bufferedEvent);
      }
      return;
    }

    const canWrite = this.writeEvent(bufferedEvent);

    if (!canWrite) {
      this.isPaused = true;
    }
  }

  private dropEvent(newEvent: BufferedEvent): void {
    const microbarIndex = this.buffer.findIndex((e) => e.event === "microbar");
    if (microbarIndex !== -1) {
      this.buffer.splice(microbarIndex, 1);
      this.buffer.push(newEvent);
    } else if (newEvent.event === "microbar") {
      // Drop the new microbar instead of queuing
    } else {
      this.buffer.shift();
      this.buffer.push(newEvent);
    }
    this.droppedCount++;
  }

  private writeEvent(event: BufferedEvent): boolean {
    let message = "";
    if (event.id) message += `id: ${event.id}\n`;
    message += `event: ${event.event}\n`;
    message += `data: ${event.data}\n\n`;

    return this.res.write(message);
  }

  private handleDrain() {
    if (this.buffer.length === 0) {
      this.isPaused = false;
      return;
    }

    while (this.buffer.length > 0) {
      const event = this.buffer.shift();
      if (!event) break;

      const canWrite = this.writeEvent(event);

      if (!canWrite) {
        this.isPaused = true;
        return;
      }
    }

    this.isPaused = false;
  }

  getStats() {
    return {
      buffered: this.buffer.length,
      dropped: this.droppedCount,
      capacity: this.maxSize,
      paused: this.isPaused,
    };
  }

  destroy() {
    this.res.off("drain", this.drainHandler);
    this.buffer = [];
    this.isPaused = false;
  }
}
