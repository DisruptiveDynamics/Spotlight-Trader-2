import { useState, useEffect, useRef } from "react";

interface Callout {
  id: string;
  kind: "watch" | "entry" | "exit" | "note";
  setupTag: string;
  rationale: string;
  qualityGrade: string;
  urgency: "now" | "soon" | "watch";
  timestamp: number;
}

const MAX_RECENT_CALLOUTS = 10;

export function CalloutAudioHandler() {
  const [recentCallouts, setRecentCallouts] = useState<Callout[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const audioContextRef = useRef<AudioContext | null>(null);

  const playChime = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  };

  const speakUrgentCallout = (callout: Callout) => {
    const message = `${callout.kind} setup on ${callout.setupTag.replace(/_/g, " ")}, grade ${callout.qualityGrade}`;
    
    window.dispatchEvent(
      new CustomEvent("nexa:urgent-callout", {
        detail: { message, callout },
      })
    );
  };

  useEffect(() => {
    const connect = () => {
      if (eventSourceRef.current?.readyState === EventSource.OPEN) {
        return;
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource("/api/copilot/callouts/stream", {
        withCredentials: true,
      });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("[CalloutAudio] SSE connected");
      };

      eventSource.onmessage = (event) => {
        const callout = JSON.parse(event.data) as Callout;

        setRecentCallouts((prev) => {
          const updated = [callout, ...prev].slice(0, MAX_RECENT_CALLOUTS);
          return updated;
        });

        const isUrgent = callout.qualityGrade === "A" && callout.urgency === "now";

        if (isUrgent) {
          speakUrgentCallout(callout);
        } else {
          playChime();
        }
      };

      eventSource.onerror = (error) => {
        console.error("[CalloutAudio] SSE error, reconnecting in 5s...", error);
        eventSource.close();

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };
    };

    connect();

    const handleGetCallouts = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.callback) {
        setRecentCallouts((current) => {
          customEvent.detail.callback(current);
          return current;
        });
      }
    };

    const handleRespondToCallout = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { calloutId, action } = customEvent.detail || {};

      if (!calloutId || !action) return;

      setRecentCallouts((prev) => {
        const callout = prev.find((c) => c.id === calloutId);
        if (!callout) return prev;

        if (customEvent.detail?.callback) {
          customEvent.detail.callback({ success: true });
        }

        return prev.filter((c) => c.id !== calloutId);
      });
    };

    window.addEventListener("nexa:get-callouts", handleGetCallouts);
    window.addEventListener("nexa:respond-callout", handleRespondToCallout);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      window.removeEventListener("nexa:get-callouts", handleGetCallouts);
      window.removeEventListener("nexa:respond-callout", handleRespondToCallout);
    };
  }, []);

  return null;
}
