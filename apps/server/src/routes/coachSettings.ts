import { Router } from 'express';
import { db } from '../db/index.js';
import { coachProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireUser, AuthRequest } from '../middleware/requireUser.js';

const router = Router();

// GET /api/coach/settings - Get coach settings
router.get('/settings', requireUser, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  try {
    const results = await db
      .select()
      .from(coachProfiles)
      .where(eq(coachProfiles.userId, userId))
      .limit(1);

    if (results.length === 0) {
      // Return defaults
      return res.json({
        agentName: 'Coach',
        voice: 'alloy',
        tonePreset: 'balanced',
        jargon: 50,
        decisiveness: 50,
      });
    }

    const profile = results[0]!;

    // Map database values to client format
    res.json({
      agentName: profile.agentName,
      voice: profile.voiceId,
      tonePreset: mapToneToPreset(profile.tone),
      jargon: Math.round(profile.jargonLevel * 100),
      decisiveness: Math.round(profile.decisiveness * 100),
    });
  } catch (error) {
    console.error('Failed to get coach settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /api/coach/settings - Update coach settings
router.put('/settings', requireUser, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { agentName, voice, tonePreset, jargon, decisiveness } = req.body;

  try {
    // Check if profile exists
    const existing = await db
      .select()
      .from(coachProfiles)
      .where(eq(coachProfiles.userId, userId))
      .limit(1);

    const profileData = {
      userId,
      agentName: agentName || 'Coach',
      voiceId: voice || 'alloy',
      tone: mapPresetToTone(tonePreset || 'balanced'),
      jargonLevel: (jargon ?? 50) / 100,
      decisiveness: (decisiveness ?? 50) / 100,
    };

    if (existing.length === 0) {
      // Insert new profile
      await db.insert(coachProfiles).values(profileData);
    } else {
      // Update existing profile
      await db
        .update(coachProfiles)
        .set(profileData)
        .where(eq(coachProfiles.userId, userId));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update coach settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

function mapPresetToTone(preset: string): string {
  const map: Record<string, string> = {
    balanced: 'supportive',
    friendly: 'encouraging',
    tough: 'direct',
    mentor: 'teaching',
  };
  return map[preset] || 'supportive';
}

function mapToneToPreset(tone: string): string {
  const reverseMap: Record<string, string> = {
    supportive: 'balanced',
    encouraging: 'friendly',
    direct: 'tough',
    teaching: 'mentor',
  };
  return reverseMap[tone] || 'balanced';
}

export default router;
