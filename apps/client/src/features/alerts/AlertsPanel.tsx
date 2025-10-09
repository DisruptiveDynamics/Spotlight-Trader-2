import { useState, useEffect } from 'react';

interface Alert {
  id: string;
  symbol: string;
  direction: 'long' | 'short' | 'flat';
  confidence: number;
  timestamp: string;
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/stream/market?symbols=SPY');

    eventSource.addEventListener('alert', (event) => {
      const alert = JSON.parse(event.data) as Alert;
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
    });

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'long':
        return 'text-green-600 bg-green-50';
      case 'short':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Trade Alerts</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-600">{isConnected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">
            {isConnected ? 'Waiting for alerts...' : 'Connecting...'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{alert.symbol}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${getDirectionColor(alert.direction)}`}
                    >
                      {alert.direction.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Confidence: {(alert.confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-xs text-gray-400">{formatTime(alert.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
