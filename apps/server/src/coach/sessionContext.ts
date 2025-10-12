import { db } from '../db/index.js';
import { coachProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { retrieveTopK } from '../memory/store.js';
import { buildKnowledgeContext } from '../memory/knowledgeRetrieval.js';
import { VOICE_COACH_SYSTEM } from './policy.js';
import { VOICE_COPILOT_TOOLS } from '../realtime/voiceTools.js';

interface CoachProfile {
  agentName: string;
  pronouns: string;
  voiceId: string;
  personality: string;
  jargonLevel: number;
  decisiveness: number;
  tone: string;
}

export async function buildSessionContext(userId: string): Promise<string> {
  const profileResults = await db
    .select()
    .from(coachProfiles)
    .where(eq(coachProfiles.userId, userId))
    .limit(1);

  const defaultProfile: CoachProfile = {
    agentName: 'Nexa',
    pronouns: 'she/her',
    voiceId: 'alloy', // Professional, consistent voice for trading coach
    personality: 'warm and intelligent',
    jargonLevel: 0.5,
    decisiveness: 0.7,
    tone: 'supportive',
  };

  const profile: CoachProfile =
    profileResults.length > 0 && profileResults[0]
      ? {
          agentName: profileResults[0].agentName,
          pronouns: profileResults[0].pronouns || 'she/her',
          voiceId: profileResults[0].voiceId,
          personality: profileResults[0].personality || 'warm and intelligent',
          jargonLevel: profileResults[0].jargonLevel,
          decisiveness: profileResults[0].decisiveness,
          tone: profileResults[0].tone,
        }
      : defaultProfile;

  const [memories, knowledgeContext] = await Promise.all([
    retrieveTopK(userId, 'what should I keep in mind today?', 4, 10, 0.1),
    buildKnowledgeContext(userId),
  ]);

  const lines: string[] = [];
  lines.push('**Your Identity:**');
  lines.push(`- Name: ${profile.agentName}`);
  lines.push(`- Pronouns: ${profile.pronouns}`);
  lines.push(`- Personality: ${profile.personality}`);
  lines.push(`- Voice: ${profile.voiceId}`);
  lines.push(`- Tone: ${profile.tone}`);
  lines.push(
    `- Jargon Level: ${profile.jargonLevel > 0.7 ? 'high' : profile.jargonLevel > 0.4 ? 'medium' : 'low'}`
  );
  lines.push(
    `- Decisiveness: ${profile.decisiveness > 0.7 ? 'high' : profile.decisiveness > 0.4 ? 'medium' : 'low'}`
  );

  if (memories.length > 0) {
    lines.push('');
    lines.push('**Key Memories:**');
    memories.forEach((mem, idx) => {
      const preview = mem.text.slice(0, 80);
      lines.push(`${idx + 1}. [${mem.kind}] ${preview}${mem.text.length > 80 ? '...' : ''}`);
    });
  }

  if (knowledgeContext) {
    lines.push('');
    lines.push(knowledgeContext);
  }

  return lines.join('\n');
}

export async function getInitialSessionUpdate(userId: string) {
  const profileResults = await db
    .select()
    .from(coachProfiles)
    .where(eq(coachProfiles.userId, userId))
    .limit(1);

  const voiceId =
    profileResults.length > 0 && profileResults[0] ? profileResults[0].voiceId : 'alloy';

  const contextBlock = await buildSessionContext(userId);

  const fullInstructions = `${VOICE_COACH_SYSTEM}\n\n${contextBlock}`;

  const tokenEstimate = Math.ceil(fullInstructions.length / 4);
  const instructions = tokenEstimate > 1200 ? fullInstructions.slice(0, 4800) : fullInstructions;

  return {
    type: 'session.update',
    session: {
      instructions,
      modalities: ['text', 'audio'],
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      voice: voiceId,
      tools: VOICE_COPILOT_TOOLS,
    },
  };
}
