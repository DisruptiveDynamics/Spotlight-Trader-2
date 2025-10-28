import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { userRules, userRuleVersions, coachMemories, coachProfiles } from '../db/schema.js';
import { z } from 'zod';

const router: Router = Router();

const importSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  rules: z.array(
    z.object({
      id: z.string().optional(),
      baseRuleId: z.string().optional(),
      versions: z.array(
        z.object({
          id: z.string().optional(),
          userRuleId: z.string().optional(),
          version: z.string(),
          doc: z.any(),
          createdAt: z.string().optional(),
        })
      ),
    })
  ),
  memories: z.array(
    z.object({
      id: z.string().optional(),
      kind: z.string(),
      text: z.string(),
      tags: z.array(z.string()),
      createdAt: z.string().optional(),
    })
  ),
  coachProfile: z
    .object({
      agentName: z.string(),
      voiceId: z.string(),
      jargonLevel: z.number(),
      decisiveness: z.number(),
      tone: z.string(),
    })
    .nullable(),
});

router.post('/all', async (req: Request, res: Response) => {
  try {
    const userId = 'default-user';
    const data = importSchema.parse(req.body);

    for (const rule of data.rules) {
      const ruleId = nanoid();

      await db.insert(userRules).values({
        id: ruleId,
        userId,
        baseRuleId: rule.baseRuleId || null,
      });

      for (const version of rule.versions) {
        await db.insert(userRuleVersions).values({
          id: nanoid(),
          userRuleId: ruleId,
          version: version.version,
          doc: version.doc,
        });
      }
    }

    for (const memory of data.memories) {
      await db.insert(coachMemories).values({
        id: nanoid(),
        userId,
        kind: memory.kind,
        text: memory.text,
        tags: memory.tags,
      });
    }

    if (data.coachProfile) {
      await db
        .insert(coachProfiles)
        .values({
          userId,
          ...data.coachProfile,
        })
        .onConflictDoUpdate({
          target: coachProfiles.userId,
          set: data.coachProfile,
        });
    }

    res.json({
      success: true,
      imported: {
        rules: data.rules.length,
        memories: data.memories.length,
        profile: data.coachProfile ? 1 : 0,
      },
    });
  } catch (error) {
    console.error('Import failed:', error);
    res.status(400).json({ error: 'Failed to import data' });
  }
});

export default router;
