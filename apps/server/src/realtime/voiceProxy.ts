import type { Server as HTTPServer } from 'http';
import type { Express } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyVoiceToken } from './auth';
import { getInitialSessionUpdate } from '../coach/sessionContext';
import { validateEnv } from '@shared/env';

const env = validateEnv(process.env);

const activeConnections = new Map<string, Set<WebSocket>>();

const MAX_CONNECTIONS_PER_USER = 3;
const HEARTBEAT_INTERVAL = 25000;

export function setupVoiceProxy(app: Express, server: HTTPServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/ws/realtime')) {
      const origin = request.headers.origin || '';
      const allowedOrigins = [env.APP_ORIGIN, env.ADMIN_ORIGIN];

      if (!allowedOrigins.includes(origin)) {
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
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('t') || request.headers['x-user-token'];

    let userId: string;

    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Missing token');
      }

      const payload = verifyVoiceToken(token);
      userId = payload.userId;
    } catch (error) {
      clientWs.close(1008, 'Unauthorized');
      return;
    }

    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, new Set());
    }

    const userConnections = activeConnections.get(userId)!;

    if (userConnections.size >= MAX_CONNECTIONS_PER_USER) {
      clientWs.close(1008, 'Too many connections');
      return;
    }

    userConnections.add(clientWs);

    const upstreamWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    const clientBuffer: string[] = [];
    let upstreamReady = false;
    let clientHeartbeat: NodeJS.Timeout | null = null;
    let upstreamHeartbeat: NodeJS.Timeout | null = null;

    upstreamWs.on('open', async () => {
      const sessionUpdate = await getInitialSessionUpdate(userId);

      const fullUpdate = {
        ...sessionUpdate,
        session: {
          ...sessionUpdate.session,
          modalities: ['audio', 'text'],
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          temperature: 0.3,
        },
      };

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
      console.error('Upstream WebSocket error:', error.message);
      clientWs.close(1011, 'Upstream error');
    });

    upstreamWs.on('close', () => {
      clientWs.close();
      if (upstreamHeartbeat) clearInterval(upstreamHeartbeat);
    });

    clientWs.on('message', (data) => {
      if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(data);
      } else {
        clientBuffer.push(data.toString());
      }
    });

    clientWs.on('error', (error) => {
      console.error('Client WebSocket error:', error.message);
    });

    clientWs.on('close', () => {
      upstreamWs.close();
      userConnections.delete(clientWs);

      if (userConnections.size === 0) {
        activeConnections.delete(userId);
      }

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
