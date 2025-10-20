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
  private recentCallouts = new Map<string, CalloutEvent[]>();
  private MAX_CALLOUTS_PER_USER = 10;

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

    const userCallouts = this.recentCallouts.get(event.userId) || [];
    userCallouts.unshift(event);
    if (userCallouts.length > this.MAX_CALLOUTS_PER_USER) {
      userCallouts.pop();
    }
    this.recentCallouts.set(event.userId, userCallouts);

    this.emit("callout", event);
  }

  getRecentCallouts(userId: string): CalloutEvent[] {
    return this.recentCallouts.get(userId) || [];
  }

  removeCallout(userId: string, calloutId: string): boolean {
    const userCallouts = this.recentCallouts.get(userId) || [];
    const index = userCallouts.findIndex((c) => c.id === calloutId);
    if (index !== -1) {
      userCallouts.splice(index, 1);
      this.recentCallouts.set(userId, userCallouts);
      return true;
    }
    return false;
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const copilotBroadcaster = new CopilotBroadcaster();
