
/**
 * Voice System Integration Tests
 * Tests the complete voice assistant pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedVoiceClient } from '../EnhancedVoiceClient.v2';

describe('Voice System Integration', () => {
  let client: EnhancedVoiceClient;
  
  beforeEach(() => {
    client = new EnhancedVoiceClient();
    
    // Mock WebSocket
    global.WebSocket = vi.fn().mockImplementation(() => ({
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: WebSocket.OPEN,
    }));
    
    // Mock AudioContext
    global.AudioContext = vi.fn().mockImplementation(() => ({
      state: 'running',
      sampleRate: 24000,
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      createBuffer: vi.fn(),
      createBufferSource: vi.fn(() => ({
        connect: vi.fn(),
        start: vi.fn(),
        buffer: null,
      })),
      createAnalyser: vi.fn(() => ({
        fftSize: 256,
        smoothingTimeConstant: 0.8,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getByteTimeDomainData: vi.fn(),
        frequencyBinCount: 128,
      })),
      createGain: vi.fn(() => ({
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      destination: {},
    }));
    
    // Mock getUserMedia
    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{
          stop: vi.fn(),
          enabled: true,
        }],
        getAudioTracks: () => [{
          stop: vi.fn(),
          enabled: true,
        }],
      }),
    } as any;
  });
  
  afterEach(() => {
    client.disconnect();
  });
  
  it('should initialize with disconnected state', () => {
    expect(client.getState()).toBe('disconnected');
    expect(client.getCoachState()).toBe('idle');
  });
  
  it('should transition to connecting state when connect is called', async () => {
    const states: string[] = [];
    client.onStateChange(state => states.push(state));
    
    const connectPromise = client.connect('test-token');
    
    expect(states).toContain('connecting');
  });
  
  it('should handle mute/unmute correctly', () => {
    client.mute();
    expect(client.isMicMuted()).toBe(true);
    expect(client.getCoachState()).toBe('muted');
    
    client.unmute();
    expect(client.isMicMuted()).toBe(false);
  });
  
  it('should cleanup resources on disconnect', () => {
    client.disconnect();
    expect(client.getState()).toBe('disconnected');
    expect(client.getCoachState()).toBe('idle');
  });
});
