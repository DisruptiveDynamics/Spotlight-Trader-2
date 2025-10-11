import type { Express } from 'express';
import { signVoiceToken } from '../realtime/auth';
import { requireUser, AuthRequest } from '../middleware/requireUser.js';
import { validateEnv } from '@shared/env';

const env = validateEnv(process.env);

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

  // GET /api/voice/token - Generate demo voice session token (no auth required)
  app.get('/api/voice/token', (req, res) => {
    if (req.query.demo === 'true') {
      const demoToken = signVoiceToken('demo-user', 60);
      return res.json({ token: demoToken });
    }
    res.status(400).json({ error: 'Demo mode required for GET requests' });
  });

  // POST /api/voice/token - Generate voice session token
  app.post('/api/voice/token', requireUser, (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const token = signVoiceToken(userId, 60);
    res.json({ token });
  });

  // GET /api/voice/ephemeral-token - Generate ephemeral token for WebRTC (demo mode)
  app.get('/api/voice/ephemeral-token', async (req, res) => {
    try {
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

      const data = await response.json();
      
      // Return the ephemeral token (starts with 'ek_')
      res.json({ 
        ephemeralKey: data.value,
        expiresIn: 60, // Token expires in 60 seconds
      });
    } catch (error) {
      console.error('Error generating ephemeral token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
