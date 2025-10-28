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

// Server-side OpenAI error cooldown (prevents hammering OpenAI during outages)
let openaiErrorCount = 0;
let openaiCooldownUntil = 0;
const OPENAI_ERROR_THRESHOLD = 3;
const OPENAI_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

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
    
    // Check OpenAI error cooldown - reject new connections during cooldown
    const now = Date.now();
    if (now < openaiCooldownUntil) {
      const remainingMs = openaiCooldownUntil - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      console.warn(`[VoiceProxy] In cooldown period. ${remainingSec}s remaining. Rejecting connection.`);
      
      clientWs.send(JSON.stringify({
        type: 'error',
        error: {
          type: 'cooldown',
          message: `OpenAI voice service is temporarily unavailable. Please retry in ${remainingSec} seconds.`,
          cooldownUntil: openaiCooldownUntil
        }
      }));
      clientWs.close(1008, 'Service in cooldown');
      return;
    }
    
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('t') || request.headers['x-user-token'];

    let userId: string = 'default-user'; // Single-user app

    // Try to verify token if present, but don't reject if missing
    if (token && typeof token === 'string') {
      try {
        const payload = verifyVoiceToken(token);
        userId = payload.userId;
      } catch {
        // Use default user if token invalid
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
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
      {
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );

    const clientBuffer: (string | Buffer)[] = [];
    let upstreamReady = false;
    let sessionCreatedReceived = false;
    let upstreamSessionId: string | null = null;
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
        
        // Wait for session.created, then send our session.update
        if (message.type === 'session.created' && !sessionCreatedReceived) {
          upstreamSessionId = message.session?.id || null;
          console.log('[VoiceProxy] Received session.created from OpenAI, session ID:', upstreamSessionId);
          sessionCreatedReceived = true;
          
          // TEST: Minimal payload to isolate API key vs data issue
          const minimalUpdate = {
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions: 'You are a helpful assistant.',
              voice: 'alloy',
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16'
            }
          };
          console.log('[VoiceProxy] Sending MINIMAL TEST session.update to OpenAI:', JSON.stringify(minimalUpdate, null, 2));
          upstreamWs.send(JSON.stringify(minimalUpdate));
          upstreamReady = true;

          // Flush buffered client messages
          while (clientBuffer.length > 0) {
            const buffered = clientBuffer.shift();
            if (buffered) {
              // If it's a Buffer (binary audio), wrap it in JSON event with base64
              if (Buffer.isBuffer(buffered)) {
                const audioB64 = buffered.toString('base64');
                upstreamWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: audioB64 }));
              } else {
                // It's a string (JSON) - send as-is
                upstreamWs.send(buffered);
              }
            }
          }

          // Start heartbeat
          upstreamHeartbeat = setInterval(() => {
            if (upstreamWs.readyState === WebSocket.OPEN) {
              upstreamWs.ping();
            }
          }, HEARTBEAT_INTERVAL);
        }
        
        // Enhanced error logging with session ID and cooldown tracking
        if (message.type === 'error' || message.type === 'server_error') {
          console.error('[VoiceProxy][UpstreamError]', {
            sessionId: upstreamSessionId,
            userId,
            eventType: message.type,
            error: message.error || message,
          });
          
          // Track OpenAI errors and enter cooldown if threshold reached
          openaiErrorCount++;
          if (openaiErrorCount >= OPENAI_ERROR_THRESHOLD) {
            openaiCooldownUntil = Date.now() + OPENAI_COOLDOWN_MS;
            console.warn(`[VoiceProxy] ${OPENAI_ERROR_THRESHOLD} OpenAI errors detected. Entering ${OPENAI_COOLDOWN_MS / 60000}min cooldown.`);
            
            // Notify client of cooldown
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'error',
                error: {
                  type: 'cooldown',
                  message: `OpenAI voice service is experiencing issues. Entering 2-minute cooldown.`,
                  cooldownUntil: openaiCooldownUntil
                }
              }));
            }
            
            // Close connections
            upstreamWs.close();
            clientWs.close(1008, 'Service entering cooldown');
          }
        }
        
        // Reset error count on successful session update
        if (message.type === 'session.updated') {
          openaiErrorCount = 0;
          openaiCooldownUntil = 0;
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

    clientWs.on('message', (data, isBinary) => {
      updateActivity();
      if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
        // Defensive: if binary data arrives, wrap it in JSON event with base64 audio
        if (isBinary && Buffer.isBuffer(data)) {
          const audioB64 = (data as Buffer).toString('base64');
          upstreamWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: audioB64 }));
          return;
        }
        // Text/JSON path - send as-is
        upstreamWs.send(data);
      } else {
        // Buffer messages until upstream is ready
        // Preserve binary data as Buffer, text data as string
        if (isBinary && Buffer.isBuffer(data)) {
          clientBuffer.push(data);
        } else {
          clientBuffer.push(data.toString());
        }
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
