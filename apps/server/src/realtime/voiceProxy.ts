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
    let sessionCreatedReceived = false;
    let clientHeartbeat: NodeJS.Timeout | null = null;
    let upstreamHeartbeat: NodeJS.Timeout | null = null;

    upstreamWs.on('open', () => {
      console.log('[VoiceProxy] Upstream OpenAI connection opened for user:', userId);
      // Don't send session.update yet - wait for session.created from OpenAI
    });

    upstreamWs.on('message', async (data) => {
      // Parse OpenAI messages to handle session.created
      try {
        const message = JSON.parse(data.toString());
        console.log('[VoiceProxy] Received from OpenAI:', message.type);
        
        // Log errors from OpenAI
        if (message.type === 'error') {
          console.error('[VoiceProxy] OpenAI error:', JSON.stringify(message, null, 2));
        }
        
        // Wait for session.created, then send our session.update
        if (message.type === 'session.created' && !sessionCreatedReceived) {
          console.log('[VoiceProxy] Received session.created from OpenAI');
          sessionCreatedReceived = true;
          
          const sessionUpdate = await getInitialSessionUpdate(userId);
          const fullUpdate = {
            type: 'session.update',
            session: {
              modalities: ['audio', 'text'],
              instructions: sessionUpdate.session.instructions,
              voice: sessionUpdate.session.voice,
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              input_audio_transcription: {
                model: 'whisper-1',
              },
              turn_detection: sessionUpdate.session.turn_detection,
              temperature: 0.8,
            },
          };

          console.log('[VoiceProxy] Sending session.update:', JSON.stringify(fullUpdate, null, 2));
          upstreamWs.send(JSON.stringify(fullUpdate));
          upstreamReady = true;

          // Flush buffered client messages
          while (clientBuffer.length > 0) {
            const buffered = clientBuffer.shift();
            if (buffered) {
              upstreamWs.send(buffered);
            }
          }

          // Start heartbeat
          upstreamHeartbeat = setInterval(() => {
            if (upstreamWs.readyState === WebSocket.OPEN) {
              upstreamWs.ping();
            }
          }, HEARTBEAT_INTERVAL);
        }
      } catch (err) {
        console.error('[VoiceProxy] Error parsing OpenAI message:', err);
      }
      
      // Forward all messages to client
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
