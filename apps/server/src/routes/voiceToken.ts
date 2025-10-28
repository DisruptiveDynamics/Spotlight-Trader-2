import type { Express } from 'express';
import { signVoiceToken } from '../realtime/auth';
import { requireUser, AuthRequest } from '../middleware/requireUser.js';
import { validateEnv } from '@shared/env';

const env = validateEnv(process.env);

// Simple in-memory rate limiter for ephemeral tokens (POC only)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 10; // 10 tokens per hour per IP

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - record.count };
}

// Available OpenAI Realtime API voices
const AVAILABLE_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and clear' },
  { id: 'echo', name: 'Echo', description: 'Warm and friendly' },
  { id: 'fable', name: 'Fable', description: 'Professional and articulate' },
  { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
  { id: 'nova', name: 'Nova', description: 'Energetic and engaging' },
  { id: 'shimmer', name: 'Shimmer', description: 'Soft and calming' },
];

export function setupVoiceTokenRoute(app: Express) {
  // GET /api/voice/voices - Get available voice options
  app.get('/api/voice/voices', (req, res) => {
    res.json({ voices: AVAILABLE_VOICES });
  });

  // GET /api/voice/token - Generate voice session token (single-user app)
  app.get('/api/voice/token', (req, res) => {
    const token = signVoiceToken('default-user', 60);
    return res.json({ token });
  });

  // POST /api/voice/token - Generate voice session token
  app.post('/api/voice/token', (req, res) => {
    const token = signVoiceToken('default-user', 60);
    res.json({ token });
  });

  // POST /api/voice/ephemeral-token - Generate ephemeral token for WebRTC
  app.post('/api/voice/ephemeral-token', async (req, res) => {
    try {
      const userId = 'default-user';
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      // Apply rate limiting per user (secondary defense)
      const rateLimit = checkRateLimit(`user:${userId}`);
      if (!rateLimit.allowed) {
        console.warn(`[VOICE SECURITY] Rate limit exceeded for user: ${userId}`);
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Max 10 tokens per hour.',
          retryAfter: 3600
        });
      }

      // Log token requests for audit trail
      console.log(`[VOICE] Ephemeral token requested by user: ${userId} from IP: ${clientIp} (${rateLimit.remaining} remaining)`);

      // Call OpenAI API to generate ephemeral token
      const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: 'gpt-4o-realtime-preview-2024-12-17',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to generate ephemeral token:', error);
        return res.status(500).json({ error: 'Failed to generate token' });
      }

      const data = await response.json() as { value: string };
      
      // Return the ephemeral token (starts with 'ek_')
      res.json({ 
        ephemeralKey: data.value,
        expiresIn: 60, // Token expires in 60 seconds
        rateLimitRemaining: rateLimit.remaining
      });
    } catch (error) {
      console.error('Error generating ephemeral token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
