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

const MAX_CALLOUTS = 10;

export function CalloutsOverlay() {
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [snoozedSymbols, setSnoozedSymbols] = useState<Set<string>>(new Set());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const connect = () => {
      if (eventSourceRef.current?.readyState === EventSource.OPEN) {
        return;
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource("/api/copilot/callouts/stream", { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("SSE connected");
      };

      eventSource.onmessage = (event) => {
        const callout = JSON.parse(event.data) as Callout;

        const symbol = callout.setupTag.split("_")[0] || callout.setupTag;
        if (snoozedSymbols.has(symbol)) {
          return;
        }

        setCallouts((prev) => {
          const newCallouts = [callout, ...prev];

          if (newCallouts.length > MAX_CALLOUTS) {
            const watchIndex = newCallouts.findIndex((c) => c.urgency === "watch");
            if (watchIndex > 0) {
              newCallouts.splice(watchIndex, 1);
            } else {
              newCallouts.pop();
            }
          }

          return newCallouts.slice(0, MAX_CALLOUTS);
        });
      };

      eventSource.onerror = (error) => {
        console.error("SSE error, reconnecting in 3s...", error);
        eventSource.close();

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [snoozedSymbols]);

  const handleAccept = async (callout: Callout) => {
    try {
      await fetch("/api/copilot/callouts/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calloutId: callout.id }),
      });

      await fetch("/api/copilot/log_journal_event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "decision",
          payload: {
            symbol: callout.setupTag,
            timeframe: "5m",
            decision: "accept",
            reasoning: `Accepted ${callout.kind} callout: ${callout.rationale}`,
          },
        }),
      });

      setCallouts((prev) => prev.filter((c) => c.id !== callout.id));
    } catch (error) {
      console.error("Failed to accept callout:", error);
    }
  };

  const handleReject = async (callout: Callout) => {
    const reason = prompt("Why are you rejecting this callout?");
    if (!reason) return;

    try {
      await fetch("/api/copilot/callouts/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calloutId: callout.id, reason }),
      });

      await fetch("/api/copilot/log_journal_event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "decision",
          payload: {
            symbol: callout.setupTag,
            timeframe: "5m",
            decision: "reject",
            reasoning: reason,
          },
        }),
      });

      setCallouts((prev) => prev.filter((c) => c.id !== callout.id));
    } catch (error) {
      console.error("Failed to reject callout:", error);
    }
  };

  const handleSnooze = (callout: Callout) => {
    const symbol = callout.setupTag.split("_")[0] || callout.setupTag;
    setSnoozedSymbols((prev) => new Set(prev).add(symbol));

    setTimeout(() => {
      setSnoozedSymbols((prev) => {
        const next = new Set(prev);
        next.delete(symbol);
        return next;
      });
    }, 30000);

    setCallouts((prev) => prev.filter((c) => c.id !== callout.id));
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "now":
        return "border-red-500 bg-red-950/40";
      case "soon":
        return "border-orange-500 bg-orange-950/40";
      case "watch":
        return "border-blue-500 bg-blue-950/40";
      default:
        return "border-gray-500 bg-gray-950/40";
    }
  };

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case "entry":
        return "📈";
      case "exit":
        return "📉";
      case "watch":
        return "👀";
      case "note":
        return "📝";
      default:
        return "💡";
    }
  };

  if (callouts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 w-80 space-y-2">
      {callouts.map((callout) => (
        <div
          key={callout.id}
          className={`border-l-4 ${getUrgencyColor(callout.urgency)} backdrop-blur-sm p-3 rounded-r-md shadow-lg animate-in slide-in-from-right duration-300`}
        >
          <div className="flex items-start gap-2">
            <span className="text-xl">{getKindIcon(callout.kind)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-gray-400 uppercase">
                  {callout.setupTag}
                </span>
                <span className="text-xs font-bold text-yellow-400">{callout.qualityGrade}</span>
              </div>
              <p className="text-sm text-gray-200 leading-snug">{callout.rationale}</p>
              <div className="mt-2 flex gap-2">
                {(callout.kind === "entry" || callout.kind === "exit") && (
                  <button
                    className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 rounded transition-colors"
                    onClick={() => handleAccept(callout)}
                  >
                    ✓ Accept
                  </button>
                )}
                <button
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded transition-colors"
                  onClick={() => handleReject(callout)}
                >
                  ✗ Reject
                </button>
                <button
                  className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                  onClick={() => handleSnooze(callout)}
                >
                  💤 Snooze 30s
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
