import type { Express } from 'express';
import { signVoiceToken } from '../realtime/auth';
import { requireUser, AuthRequest } from '../middleware/requireUser.js';

export function setupVoiceTokenRoute(app: Express) {
  app.post('/api/voice/token', requireUser, (req: AuthRequest, res) => {
    const userId = req.user!.userId;

    const token = signVoiceToken(userId, 60);

    res.json({ token });
  });
}
