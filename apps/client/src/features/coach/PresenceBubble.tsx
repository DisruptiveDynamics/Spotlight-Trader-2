import { useEffect, useRef, useState } from 'react';
import { EnhancedVoiceClient } from '../../voice/EnhancedVoiceClient';
import { VoiceFallback } from './VoiceFallback';
import { ensureiOSAudioUnlocked } from '../../voice/ios';

type CoachState = 'listening' | 'thinking' | 'speaking' | 'idle' | 'muted';
type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'offline';
type PermissionState = 'pending' | 'granted' | 'denied';

interface WaveProps {
  amplitude: number;
  state: CoachState;
  reducedMotion: boolean;
}

function WaveAnimation({ amplitude, state, reducedMotion }: WaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);
  const amplitudeRef = useRef(amplitude);
  const stateRef = useRef(state);

  // Update refs without triggering re-render
  useEffect(() => {
    amplitudeRef.current = amplitude;
  }, [amplitude]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 200 * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const centerX = 100;
    const centerY = 100;
    const baseRadius = 40;

    const draw = () => {
      ctx.clearRect(0, 0, 200, 200);
      timeRef.current += 0.02;

      const currentState = stateRef.current;
      const currentAmplitude = amplitudeRef.current;

      if (currentState === 'idle') {
        const breathRadius = baseRadius + Math.sin(timeRef.current * 0.5) * 5;

        // Outer glow
        const outerGlow = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          breathRadius + 40
        );
        outerGlow.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
        outerGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.5)');
        outerGlow.addColorStop(1, 'rgba(59, 130, 246, 0)');

        ctx.beginPath();
        ctx.arc(centerX, centerY, breathRadius + 40, 0, Math.PI * 2);
        ctx.fillStyle = outerGlow;
        ctx.fill();

        // Inner core
        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          breathRadius
        );
        gradient.addColorStop(0, 'rgba(59, 130, 246, 1)');
        gradient.addColorStop(0.7, 'rgba(59, 130, 246, 0.9)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.4)');

        ctx.beginPath();
        ctx.arc(centerX, centerY, breathRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      } else if (currentState === 'listening') {
        const points = 64;
        const variance = currentAmplitude * 15;

        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const noise = Math.sin(angle * 3 + timeRef.current * 2) * variance;
          const radius = baseRadius + noise + currentAmplitude * 10;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();

        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          baseRadius + 20
        );
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      } else if (currentState === 'thinking') {
        const shimmerRadius = baseRadius + Math.sin(timeRef.current) * 5;
        const gradient = ctx.createLinearGradient(
          centerX - shimmerRadius,
          centerY - shimmerRadius,
          centerX + shimmerRadius,
          centerY + shimmerRadius
        );

        const offset = (timeRef.current * 0.5) % 1;
        gradient.addColorStop(Math.max(0, offset - 0.3), 'rgba(168, 85, 247, 0)');
        gradient.addColorStop(offset, 'rgba(168, 85, 247, 0.8)');
        gradient.addColorStop(Math.min(1, offset + 0.3), 'rgba(168, 85, 247, 0)');

        ctx.beginPath();
        ctx.arc(centerX, centerY, shimmerRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      } else if (currentState === 'speaking') {
        const ripples = 3;
        for (let i = 0; i < ripples; i++) {
          const progress = (timeRef.current * 0.5 + i * 0.33) % 1;
          const rippleRadius = baseRadius + progress * 40;
          const opacity = 1 - progress;

          const gradient = ctx.createRadialGradient(
            centerX,
            centerY,
            rippleRadius - 5,
            centerX,
            centerY,
            rippleRadius
          );
          gradient.addColorStop(0, `rgba(59, 130, 246, 0)`);
          gradient.addColorStop(1, `rgba(59, 130, 246, ${opacity * 0.4})`);

          ctx.beginPath();
          ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.fill();
      } else if (currentState === 'muted') {
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(107, 114, 128, 0.3)';
        ctx.fill();
      }

      if (!reducedMotion) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ width: '200px', height: '200px' }}
    />
  );
}

export function PresenceBubble() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [coachState, setCoachState] = useState<CoachState>('idle');
  const [amplitude, setAmplitude] = useState(0);
  const [latency, setLatency] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [_permissionState, setPermissionState] = useState<PermissionState>('pending');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const voiceClientRef = useRef<EnhancedVoiceClient | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tooltipTimerRef = useRef<number>();
  const statusTimerRef = useRef<number>();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const client = new EnhancedVoiceClient();
    voiceClientRef.current = client;

    const unsubscribeState = client.onStateChange(setConnectionState);
    const unsubscribeCoach = client.onCoachStateChange(setCoachState);
    const unsubscribeAmplitude = client.onAmplitudeChange(setAmplitude);
    const unsubscribeLatency = client.onLatencyChange(setLatency);
    const unsubscribePermission = client.onPermissionChange((state) => {
      setPermissionState(state);

      // Show status message for permission changes
      if (state === 'granted') {
        showStatusMessage('Mic activated ✅');
      } else if (state === 'denied') {
        showStatusMessage('Mic permission denied');
      }
    });

    tooltipTimerRef.current = window.setTimeout(() => {
      if (!hasInteracted) {
        setShowTooltip(true);
      }
    }, 5000);

    return () => {
      unsubscribeState();
      unsubscribeCoach();
      unsubscribeAmplitude();
      unsubscribeLatency();
      unsubscribePermission();
      client.disconnect();
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const showStatusMessage = (message: string, duration = 2000) => {
    setStatusMessage(message);

    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }

    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage('');
    }, duration);
  };

  const fetchToken = async (): Promise<string> => {
    const response = await fetch('/api/voice/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.token;
  };

  const handleBubbleClick = async () => {
    if (!hasInteracted) {
      setHasInteracted(true);
      setShowTooltip(false);
    }

    const client = voiceClientRef.current;
    if (!client) return;

    if (
      connectionState === 'disconnected' ||
      connectionState === 'error' ||
      connectionState === 'offline'
    ) {
      try {
        // Unlock iOS audio on first user gesture
        await ensureiOSAudioUnlocked();
        
        const token = await fetchToken();
        tokenRef.current = token;
        await client.connect(token);

        if (client.getPermissionState() === 'denied') {
          setShowFallback(true);
        }
      } catch (error) {
        console.error('Failed to connect:', error);

        if (client.getPermissionState() === 'denied') {
          setShowFallback(true);
        }
      }
    } else if (connectionState === 'connected') {
      if (coachState === 'speaking') {
        client.interrupt();
      } else {
        client.toggleMute();
      }
    }
  };

  const handleDisconnect = () => {
    voiceClientRef.current?.disconnect();
    setShowFallback(false);
  };

  const handleSendMessage = async (message: string) => {
    console.log('Text message:', message);

    // TODO: Implement text-based API endpoint for coach
    // For now, just log the message
  };

  const handleCloseFallback = () => {
    setShowFallback(false);
    handleDisconnect();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      if (connectionState === 'connected') {
        voiceClientRef.current?.toggleMute();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDisconnect();
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [connectionState]);

  const getStateLabel = () => {
    if (connectionState === 'connecting') return 'Connecting...';
    if (connectionState === 'reconnecting') return 'Reconnecting...';
    if (connectionState === 'offline') return 'Offline — retrying…';
    if (connectionState === 'error') return 'Error';
    if (connectionState === 'disconnected') return 'Click to activate';
    if (coachState === 'muted') return 'Muted';
    return coachState.charAt(0).toUpperCase() + coachState.slice(1);
  };

  const getLatencyColor = () => {
    if (latency === 0) return 'text-gray-400';
    if (latency < 500) return 'text-green-400';
    if (latency < 1500) return 'text-amber-400';
    return 'text-red-400';
  };

  const showThinkingOverlay = latency > 1500 && coachState === 'thinking';

  if (showFallback) {
    return <VoiceFallback onSendMessage={handleSendMessage} onClose={handleCloseFallback} />;
  }

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <div className="relative">
        <button
          onClick={handleBubbleClick}
          className="relative w-[200px] h-[200px] rounded-full focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition-transform hover:scale-105 touch-manipulation"
          aria-label={getStateLabel()}
          aria-pressed={connectionState === 'connected'}
          role="button"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <WaveAnimation amplitude={amplitude} state={coachState} reducedMotion={reducedMotion} />

          {connectionState === 'connected' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDisconnect();
              }}
              className="absolute top-4 right-4 w-12 h-12 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-all shadow-lg hover:shadow-xl z-10 border-2 border-white/30"
              aria-label="Disconnect Coach"
            >
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}

          {showThinkingOverlay && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 rounded-full">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
                <span className="text-sm text-white font-medium">Thinking...</span>
              </div>
            </div>
          )}
        </button>

        <div className="mt-4 text-center space-y-2">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {getStateLabel()}
          </div>

          {connectionState === 'connected' && latency > 0 && (
            <div className={`text-xs font-mono ${getLatencyColor()}`}>{latency}ms</div>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400">T: toggle • Esc: exit</div>
        </div>

        {showTooltip && (
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 bg-gray-900 text-white text-sm p-3 rounded-lg shadow-xl animate-fadeIn">
            <div className="text-center">Click to talk. Tap again to mute. X to exit.</div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-3 h-3 bg-gray-900" />
          </div>
        )}

        {statusMessage && (
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-fadeIn whitespace-nowrap">
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}
