import { useState, useEffect } from 'react';

interface Callout {
  id: string;
  kind: 'watch' | 'entry' | 'exit' | 'note';
  setupTag: string;
  rationale: string;
  qualityGrade: string;
  urgency: 'now' | 'soon' | 'watch';
  timestamp: number;
}

export function CalloutsOverlay() {
  const [callouts, setCallouts] = useState<Callout[]>([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/copilot/callouts/stream');

    eventSource.onmessage = (event) => {
      const callout = JSON.parse(event.data) as Callout;
      setCallouts((prev) => [callout, ...prev].slice(0, 5));
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'now':
        return 'border-red-500 bg-red-950/40';
      case 'soon':
        return 'border-orange-500 bg-orange-950/40';
      case 'watch':
        return 'border-blue-500 bg-blue-950/40';
      default:
        return 'border-gray-500 bg-gray-950/40';
    }
  };

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case 'entry':
        return '📈';
      case 'exit':
        return '📉';
      case 'watch':
        return '👀';
      case 'note':
        return '📝';
      default:
        return '💡';
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
                <span className="text-xs font-bold text-yellow-400">
                  {callout.qualityGrade}
                </span>
              </div>
              <p className="text-sm text-gray-200 leading-snug">
                {callout.rationale}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 rounded transition-colors"
                  onClick={() => {
                    setCallouts((prev) => prev.filter((c) => c.id !== callout.id));
                  }}
                >
                  ✓ Got it
                </button>
                <button
                  className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                  onClick={() => {
                    setCallouts((prev) => prev.filter((c) => c.id !== callout.id));
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
