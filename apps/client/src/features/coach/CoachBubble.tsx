import { useState, useEffect, useRef } from 'react';
import { VoiceClient } from '../../voice/VoiceClient';

type CoachState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function CoachBubble() {
  const [isPowered, setIsPowered] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [coachState, setCoachState] = useState<CoachState>('idle');
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const voiceClient = useRef<VoiceClient | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    voiceClient.current = new VoiceClient();

    const unsubscribe = voiceClient.current.onStateChange((state) => {
      setConnectionState(state);
    });

    const unsubscribeCoachState = voiceClient.current.onCoachStateChange((state) => {
      setCoachState(state);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleMic();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handlePowerOff();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribe();
      unsubscribeCoachState();
      voiceClient.current?.disconnect();
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fetchToken = async (): Promise<string> => {
    const response = await fetch('http://localhost:4000/api/voice/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    return data.token;
  };

  const handlePowerOn = async () => {
    try {
      const token = await fetchToken();
      tokenRef.current = token;
      await voiceClient.current?.connect(token);
      setIsPowered(true);
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handlePowerOff = () => {
    voiceClient.current?.disconnect();
    setIsPowered(false);
    setIsMicActive(false);
    setCoachState('idle');
  };

  const togglePower = () => {
    if (isPowered) {
      handlePowerOff();
    } else {
      handlePowerOn();
    }
  };

  const toggleMic = async () => {
    if (!isPowered || !voiceClient.current) return;

    if (isMicActive) {
      voiceClient.current.disableMic();
      setIsMicActive(false);
    } else {
      await voiceClient.current.enableMic();
      setIsMicActive(true);
    }
  };

  const getStateColor = () => {
    switch (coachState) {
      case 'listening':
        return 'bg-green-500';
      case 'thinking':
        return 'bg-yellow-500';
      case 'speaking':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="fixed bottom-8 right-8 flex flex-col items-end gap-4">
      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStateColor()}`} />
            <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">
              {coachState}
            </span>
          </div>

          {latencyMs !== null && <div className="text-xs text-gray-500">RTT: {latencyMs}ms</div>}

          <div className="text-xs text-gray-500">{connectionState}</div>
        </div>

        <div className="flex gap-2 ml-4">
          <button
            onClick={toggleMic}
            disabled={!isPowered}
            className={`p-3 rounded-full transition-colors ${
              isMicActive
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Toggle mic (T)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>

          <button
            onClick={togglePower}
            className={`p-3 rounded-full transition-colors ${
              isPowered
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
            title="Power (Esc to disconnect)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Keyboard: T (talk) • Esc (stop)
      </div>
    </div>
  );
}
