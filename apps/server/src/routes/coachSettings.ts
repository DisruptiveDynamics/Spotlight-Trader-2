import { eq } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";

import { db } from "../db/index.js";
import { coachProfiles } from "../db/schema.js";
import { requirePin } from "../middleware/requirePin";

const router: Router = Router();

router.get("/settings", requirePin, async (req: Request, res: Response) => {
  const userId = (req as any).userId;

  try {
    const results = await db
      .select()
      .from(coachProfiles)
      .where(eq(coachProfiles.userId, userId))
      .limit(1);

    if (results.length === 0) {
      return res.json({
        agentName: "Coach",
        voice: "alloy",
        tonePreset: "balanced",
        jargon: 50,
        decisiveness: 50,
      });
    }

    const profile = results[0]!;

    res.json({
      agentName: profile.agentName,
      voice: profile.voiceId,
      tonePreset: mapToneToPreset(profile.tone),
      jargon: Math.round(profile.jargonLevel * 100),
      decisiveness: Math.round(profile.decisiveness * 100),
    });
  } catch (error) {
    console.error("Failed to get coach settings:", error);
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/settings", requirePin, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { agentName, voice, tonePreset, jargon, decisiveness } = req.body;

  try {
    const existing = await db
      .select()
      .from(coachProfiles)
      .where(eq(coachProfiles.userId, userId))
      .limit(1);

    const profileData = {
      userId,
      agentName: agentName || "Coach",
      voiceId: voice || "alloy",
      tone: mapPresetToTone(tonePreset || "balanced"),
      jargonLevel: (jargon ?? 50) / 100,
      decisiveness: (decisiveness ?? 50) / 100,
    };

    if (existing.length === 0) {
      await db.insert(coachProfiles).values(profileData);
    } else {
      await db.update(coachProfiles).set(profileData).where(eq(coachProfiles.userId, userId));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to update coach settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

function mapPresetToTone(preset: string): string {
  const map: Record<string, string> = {
    balanced: "supportive",
    friendly: "encouraging",
    tough: "direct",
    mentor: "teaching",
  };
  return map[preset] || "supportive";
}

function mapToneToPreset(tone: string): string {
  const reverseMap: Record<string, string> = {
    supportive: "balanced",
    encouraging: "friendly",
    direct: "tough",
    teaching: "mentor",
  };
  return reverseMap[tone] || "balanced";
}

router.patch("/voice", requirePin, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { voiceId } = req.body;

  if (!voiceId) {
    return res.status(400).json({ error: "voiceId is required" });
  }

  const validVoices = ["alloy", "echo", "shimmer", "fable", "onyx", "nova"];
  if (!validVoices.includes(voiceId)) {
    return res
      .status(400)
      .json({ error: "Invalid voice. Must be one of: " + validVoices.join(", ") });
  }

  try {
    const existing = await db
      .select()
      .from(coachProfiles)
      .where(eq(coachProfiles.userId, userId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(coachProfiles).values({
        userId,
        agentName: "Nexa",
        voiceId,
        tone: "supportive",
        jargonLevel: 0.5,
        decisiveness: 0.7,
        personality: "warm and intelligent",
        pronouns: "she/her",
      });
    } else {
      await db.update(coachProfiles).set({ voiceId }).where(eq(coachProfiles.userId, userId));
    }

    res.json({ success: true, voiceId });
  } catch (error) {
    console.error("Failed to update voice:", error);
    res.status(500).json({ error: "Failed to update voice" });
  }
});

export default router;
