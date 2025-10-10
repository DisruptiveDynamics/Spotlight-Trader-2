import type { Express } from 'express';
import { signVoiceToken } from '../realtime/auth';
import { requireUser, AuthRequest } from '../middleware/requireUser.js';

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
}
