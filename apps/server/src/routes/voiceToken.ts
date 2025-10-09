import type { Express } from 'express';
import { signVoiceToken } from '../realtime/auth';

export function setupVoiceTokenRoute(app: Express) {
  app.post('/api/voice/token', (req, res) => {
    const userId = 'demo-user';

    const token = signVoiceToken(userId, 60);

    res.json({ token });
  });
}
