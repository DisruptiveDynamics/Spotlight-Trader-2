import { EventEmitter } from "events";
import type { WebSocket } from "ws";

import { copilotBroadcaster } from "../copilot/broadcaster";

interface VoiceSession {
  userId: string;
  ws: WebSocket;
  upstreamWs: WebSocket;
}

class VoiceCalloutBridge extends EventEmitter {
  private voiceSessions = new Map<string, VoiceSession>();

  constructor() {
    super();
    this.setupCalloutListener();
  }

  private setupCalloutListener(): void {
    copilotBroadcaster.on("callout", (callout) => {
      const session = this.voiceSessions.get(callout.userId);

      if (session && session.upstreamWs.readyState === 1) {
        // WebSocket.OPEN
        console.log("[VoiceCalloutBridge] Injecting callout into voice session:", {
          userId: callout.userId,
          setupTag: callout.setupTag,
          urgency: callout.urgency,
        });

        // Inject callout as a conversation item for the assistant to respond to
        const conversationItem = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `[ALERT] ${callout.setupTag.replace(/_/g, " ")} detected. ${callout.rationale}. Quality: ${callout.qualityGrade}. Urgency: ${callout.urgency}. Provide quick coaching on this setup.`,
              },
            ],
          },
        };

        session.upstreamWs.send(JSON.stringify(conversationItem));

        // Trigger voice response
        session.upstreamWs.send(JSON.stringify({ type: "response.create" }));

        console.log("[VoiceCalloutBridge] Callout injected, voice response triggered");
      }
    });
  }

  registerSession(userId: string, clientWs: WebSocket, upstreamWs: WebSocket): void {
    this.voiceSessions.set(userId, { userId, ws: clientWs, upstreamWs });
    console.log("[VoiceCalloutBridge] Voice session registered:", userId);
  }

  unregisterSession(userId: string): void {
    this.voiceSessions.delete(userId);
    console.log("[VoiceCalloutBridge] Voice session unregistered:", userId);
  }

  getActiveSessionCount(): number {
    return this.voiceSessions.size;
  }
}

export const voiceCalloutBridge = new VoiceCalloutBridge();
