import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { users, magicLinks, sessions } from '../db/schema.js';
import { startAuthSchema, callbackQuerySchema } from '../auth/models.js';
import { sendMagicLink } from '../auth/mail.js';
import { signJwt, verifyJwt } from '../auth/jwt.js';
import { validateEnv } from '@shared/env';
import { eq, and, gte } from 'drizzle-orm';

const env = validateEnv(process.env);
const router = Router();

router.post('/start', async (req, res) => {
  try {
    const { email } = startAuthSchema.parse(req.body);

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + parseInt(env.MAGIC_TTL) * 1000);

    await db.insert(magicLinks).values({
      email,
      token,
      expiresAt,
    });

    const redirectUrl = `${env.APP_ORIGIN}/auth/callback`;
    await sendMagicLink(email, token, redirectUrl);

    res.json({ success: true, message: 'Magic link sent to your email' });
  } catch (error) {
    console.error('Failed to start auth:', error);
    res.status(400).json({ error: 'Invalid request' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { token } = callbackQuerySchema.parse(req.query);

    const [link] = await db
      .select()
      .from(magicLinks)
      .where(and(eq(magicLinks.token, token), eq(magicLinks.used, false), gte(magicLinks.expiresAt, new Date())))
      .limit(1);

    if (!link) {
      return res.status(400).send('Invalid or expired magic link');
    }

    await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.id, link.id));

    const existingUsers = await db.select().from(users).where(eq(users.email, link.email)).limit(1);
    
    let user = existingUsers[0];
    if (!user) {
      const newUsers = await db.insert(users).values({ email: link.email }).returning();
      user = newUsers[0];
    }

    if (!user) {
      return res.status(500).send('Failed to create user');
    }

    const sessionTtl = parseInt(env.SESSION_TTL);
    const expiresAt = new Date(Date.now() + sessionTtl * 1000);

    await db.insert(sessions).values({
      userId: user.id,
      expiresAt,
    });

    const jwt = signJwt({ userId: user.id, email: user.email }, sessionTtl);

    res.cookie('sid', jwt, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sessionTtl * 1000,
    });

    res.redirect('/');
  } catch (error) {
    console.error('Failed to process callback:', error);
    res.status(400).send('Authentication failed');
  }
});

router.post('/demo', async (req, res) => {
  if (env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Demo login only available in development' });
  }

  try {
    const demoEmail = 'demo-user@local';

    const existingUsers = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
    
    let user = existingUsers[0];
    if (!user) {
      const newUsers = await db.insert(users).values({ email: demoEmail }).returning();
      user = newUsers[0];
    }

    if (!user) {
      return res.status(500).json({ error: 'Failed to create demo user' });
    }

    const sessionTtl = parseInt(env.SESSION_TTL);
    const expiresAt = new Date(Date.now() + sessionTtl * 1000);

    await db.insert(sessions).values({
      userId: user.id,
      expiresAt,
    });

    const jwt = signJwt({ userId: user.id, email: user.email }, sessionTtl);

    res.cookie('sid', jwt, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: sessionTtl * 1000,
    });

    res.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Failed to demo login:', error);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.sid || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const payload = verifyJwt(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const userResults = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    const user = userResults[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Failed to get user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('sid');
  res.json({ success: true });
});

export default router;
