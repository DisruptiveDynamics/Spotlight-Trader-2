import { EventEmitter } from "events";
import type { Response } from "express";

interface CalloutEvent {
  id: string;
  userId: string;
  kind: "watch" | "entry" | "exit" | "note";
  setupTag: string;
  rationale: string;
  qualityGrade: string;
  urgency: "now" | "soon" | "watch";
  timestamp: number;
}

class CopilotBroadcaster extends EventEmitter {
  private clients = new Map<string, Response>();

  addClient(userId: string, res: Response) {
    this.clients.set(userId, res);

    res.on("close", () => {
      this.clients.delete(userId);
    });
  }

  broadcastCallout(event: CalloutEvent) {
    const client = this.clients.get(event.userId);

    if (client) {
      try {
        client.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        console.error("Failed to broadcast callout:", err);
        this.clients.delete(event.userId);
      }
    }

    this.emit("callout", event);
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const copilotBroadcaster = new CopilotBroadcaster();
