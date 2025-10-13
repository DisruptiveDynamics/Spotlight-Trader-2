import { useEffect, useRef, useState } from 'react';
import { EnhancedVoiceClient } from '../../voice/EnhancedVoiceClient.v2';
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
  size?: number;
}

function WaveAnimation({ amplitude, state, reducedMotion, size = 200 }: WaveProps) {
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
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = size * 0.2;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      timeRef.current += 0.02;

      const currentState = stateRef.current;
      const currentAmplitude = amplitudeRef.current;

      if (currentState === 'idle') {
        const breathRadius = baseRadius + Math.sin(timeRef.current * 0.5) * (size * 0.025);

        // Outer glow
        const outerGlow = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          breathRadius + (size * 0.2)
        );
        outerGlow.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
        outerGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.5)');
        outerGlow.addColorStop(1, 'rgba(59, 130, 246, 0)');

        ctx.beginPath();
        ctx.arc(centerX, centerY, breathRadius + (size * 0.2), 0, Math.PI * 2);
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
        const variance = currentAmplitude * (size * 0.075);

        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const noise = Math.sin(angle * 3 + timeRef.current * 2) * variance;
          const radius = baseRadius + noise + currentAmplitude * (size * 0.05);
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
          baseRadius + (size * 0.1)
        );
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      } else if (currentState === 'thinking') {
        const shimmerRadius = baseRadius + Math.sin(timeRef.current) * (size * 0.025);
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
          const rippleRadius = baseRadius + progress * (size * 0.2);
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
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}

interface PresenceBubbleProps {
  compact?: boolean;
}

export function PresenceBubble({ compact = false }: PresenceBubbleProps) {
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
  const clickTimeoutRef = useRef<number | null>(null);
  const clickCountRef = useRef(0);
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
    
    client.onStateChange((state: ConnectionState) => {
      setConnectionState(state);
      if (state === 'disconnected' || state === 'error' || state === 'offline') {
        setCoachState('idle');
      }
    });
    
    client.onCoachStateChange((state: CoachState) => {
      setCoachState(state);
    });
    
    client.onAmplitudeChange((level: number) => {
      setAmplitude(level);
    });
    
    client.onLatency((ms: number) => {
      setLatency(ms);
    });
    
    client.onPermissionChange((state: PermissionState) => {
      setPermissionState(state);
    });
    
    voiceClientRef.current = client;

    tooltipTimerRef.current = window.setTimeout(() => {
      if (!hasInteracted) {
        setShowTooltip(true);
      }
    }, 5000);

    return () => {
      client.disconnect();
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
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

  const fetchEphemeralToken = async (): Promise<string> => {
    const response = await fetch('/api/voice/ephemeral-token', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Failed to fetch ephemeral token: ${error.error || response.statusText}`);
    }

    const data = await response.json();
    return data.ephemeralKey;
  };

  const handleBubbleClick = async () => {
    if (!hasInteracted) {
      setHasInteracted(true);
      setShowTooltip(false);
    }

    const client = voiceClientRef.current;
    if (!client) return;

    // Implement single-click vs double-click detection
    clickCountRef.current += 1;

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    // Double-click detection (within 300ms)
    if (clickCountRef.current === 2) {
      clickCountRef.current = 0;
      
      // Double-click → Disconnect
      if (connectionState === 'connected') {
        showStatusMessage('Disconnecting...', 1000);
        await client.disconnect();
      }
      return;
    }

    // Single-click with delay to detect if double-click follows
    clickTimeoutRef.current = window.setTimeout(async () => {
      clickCountRef.current = 0;

      // Single-click behavior
      if (
        connectionState === 'disconnected' ||
        connectionState === 'error' ||
        connectionState === 'offline'
      ) {
        // Idle/Error → Connect
        try {
          showStatusMessage('Connecting...', 3000);
          
          // Unlock iOS audio on first user gesture (critical for Safari/iOS)
          await ensureiOSAudioUnlocked();
          
          // Fetch ephemeral token
          const ephemeralKey = await fetchEphemeralToken();
          
          // Connect client with token (EnhancedVoiceClient handles WebSocket connection)
          await client.connect(ephemeralKey);

          showStatusMessage('Voice coach connected ✅', 2000);
        } catch (error) {
          console.error('Failed to connect voice coach:', error);
          showStatusMessage('Connection failed. Please try again.', 3000);
        }
      } else if (connectionState === 'connected') {
        // Connected → Toggle mute/unmute
        try {
          client.toggleMute();
          showStatusMessage(client.isMicMuted() ? 'Muted 🔇' : 'Unmuted 🔊', 1500);
        } catch (error) {
          console.error('Failed to toggle mute:', error);
          showStatusMessage('Failed to toggle mute', 2000);
        }
      }
    }, 300);
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
      if (connectionState === 'connected' && voiceClientRef.current) {
        try {
          voiceClientRef.current.toggleMute();
          showStatusMessage(voiceClientRef.current.isMicMuted() ? 'Muted 🔇' : 'Unmuted 🔊', 1500);
        } catch (error) {
          console.error('Failed to toggle mute:', error);
          showStatusMessage('Failed to toggle mute', 2000);
        }
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

  const showThinkingOverlay = latency > 1500 && coachState === 'thinking' && !compact;
  const bubbleSize = compact ? 36 : 200;

  if (showFallback) {
    return <VoiceFallback onSendMessage={handleSendMessage} onClose={handleCloseFallback} />;
  }

  if (compact) {
    return (
      <div className="relative flex items-center gap-3">
        <button
          onClick={handleBubbleClick}
          className="relative w-9 h-9 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-transform hover:scale-105 touch-manipulation"
          aria-label={getStateLabel()}
          aria-pressed={connectionState === 'connected'}
          role="button"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <WaveAnimation amplitude={amplitude} state={coachState} reducedMotion={reducedMotion} size={bubbleSize} />
        </button>

        {statusMessage && (
          <div className="bg-gray-700/90 text-white text-xs px-3 py-1.5 rounded-md shadow-lg animate-fadeIn whitespace-nowrap">
            {statusMessage}
          </div>
        )}
      </div>
    );
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
          <WaveAnimation amplitude={amplitude} state={coachState} reducedMotion={reducedMotion} size={bubbleSize} />

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
