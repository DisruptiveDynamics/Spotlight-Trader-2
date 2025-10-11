import type { Server as HTTPServer } from 'http';
import type { Express } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyVoiceToken } from './auth';
import { getInitialSessionUpdate } from '../coach/sessionContext';
import { validateEnv } from '@shared/env';
import {
  recordWSConnection,
  recordWSDisconnection,
  recordWSLRUEviction,
} from '../metrics/registry';

const env = validateEnv(process.env);

interface ConnectionInfo {
  ws: WebSocket;
  lastActivity: number;
}

const activeConnections = new Map<string, ConnectionInfo[]>();

const MAX_CONNECTIONS_PER_USER = 3;
const HEARTBEAT_INTERVAL = 25000;

export function setupVoiceProxy(app: Express, server: HTTPServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/ws/realtime')) {
      const origin = request.headers.origin || '';
      const allowedOrigins = [env.APP_ORIGIN, env.ADMIN_ORIGIN];

      // Allow Replit preview domains when REPL_ID is present
      const isReplitDev = process.env.REPL_ID && origin.endsWith('.replit.dev');
      
      // Allow localhost/127.0.0.1 in development (not production)
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isDev = process.env.NODE_ENV !== 'production';
      
      const isAllowed = allowedOrigins.includes(origin) || isReplitDev || (isDev && isLocalhost);

      if (!isAllowed) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (clientWs, request) => {
    console.log('[VoiceProxy] Client WebSocket connected');
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('t') || request.headers['x-user-token'];

    let userId: string = 'demo-user'; // Default for POC

    // Try to verify token if present, but don't reject if missing
    if (token && typeof token === 'string') {
      try {
        const payload = verifyVoiceToken(token);
        userId = payload.userId;
      } catch {
        // Use default demo-user if token invalid
      }
    }

    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, []);
    }

    const userConnections = activeConnections.get(userId)!;

    if (userConnections.length >= MAX_CONNECTIONS_PER_USER) {
      userConnections.sort((a, b) => a.lastActivity - b.lastActivity);
      const lruConnection = userConnections.shift();
      if (lruConnection) {
        recordWSLRUEviction();
        lruConnection.ws.close(1000, 'Connection limit reached - disconnecting LRU');
      }
    }

    const connectionInfo: ConnectionInfo = {
      ws: clientWs,
      lastActivity: Date.now(),
    };

    userConnections.push(connectionInfo);
    recordWSConnection(userId);

    const updateActivity = () => {
      connectionInfo.lastActivity = Date.now();
    };

    const upstreamWs = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
      {
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );

    const clientBuffer: string[] = [];
    let upstreamReady = false;
    let clientHeartbeat: NodeJS.Timeout | null = null;
    let upstreamHeartbeat: NodeJS.Timeout | null = null;

    upstreamWs.on('open', async () => {
      console.log('[VoiceProxy] Upstream OpenAI connection opened for user:', userId);
      const sessionUpdate = await getInitialSessionUpdate(userId);

      const fullUpdate = {
        ...sessionUpdate,
        session: {
          ...sessionUpdate.session,
          modalities: ['audio', 'text'],
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          temperature: 0.3,
        },
      };

      console.log('[VoiceProxy] Sending session update to OpenAI');
      upstreamWs.send(JSON.stringify(fullUpdate));
      upstreamReady = true;

      while (clientBuffer.length > 0) {
        const buffered = clientBuffer.shift();
        if (buffered) {
          upstreamWs.send(buffered);
        }
      }

      upstreamHeartbeat = setInterval(() => {
        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.ping();
        }
      }, HEARTBEAT_INTERVAL);
    });

    upstreamWs.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    });

    upstreamWs.on('error', (error) => {
      console.error('[VoiceProxy] Upstream WebSocket error:', {
        message: error.message,
        userId,
        stack: error.stack,
      });
      clientWs.close(1011, 'Upstream error');
    });

    upstreamWs.on('close', (code, reason) => {
      console.log('[VoiceProxy] Upstream OpenAI connection closed:', { code, reason: reason.toString(), userId });
      clientWs.close();
      if (upstreamHeartbeat) clearInterval(upstreamHeartbeat);
    });

    clientWs.on('message', (data) => {
      updateActivity();
      if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(data);
      } else {
        clientBuffer.push(data.toString());
      }
    });

    clientWs.on('error', (error) => {
      console.error('[VoiceProxy] Client WebSocket error:', {
        message: error.message,
        userId,
        readyState: clientWs.readyState,
      });
    });

    clientWs.on('close', (code) => {
      upstreamWs.close();
      const index = userConnections.findIndex((conn) => conn.ws === clientWs);
      if (index !== -1) {
        userConnections.splice(index, 1);
      }

      if (userConnections.length === 0) {
        activeConnections.delete(userId);
      }

      const reason = code === 1000 ? 'normal' : code === 1008 ? 'unauthorized' : 'error';
      recordWSDisconnection(userId, reason);

      if (clientHeartbeat) clearInterval(clientHeartbeat);
      if (upstreamHeartbeat) clearInterval(upstreamHeartbeat);
    });

    clientHeartbeat = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.ping();
      }
    }, HEARTBEAT_INTERVAL);
  });

  return wss;
}
