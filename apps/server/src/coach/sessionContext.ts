import { db } from '../db/index.js';
import { coachProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { retrieveTopK } from '../memory/store.js';
import { VOICE_COACH_SYSTEM } from './policy.js';

interface CoachProfile {
  agentName: string;
  voiceId: string;
  jargonLevel: number;
  decisiveness: number;
  tone: string;
}

interface SessionUpdate {
  type: 'session.update';
  session: {
    type?: 'realtime';
    instructions?: string;
    voice?: string;
    turn_detection?: {
      type: string;
      threshold?: number;
      prefix_padding_ms?: number;
      silence_duration_ms?: number;
    };
  };
}

export async function buildSessionContext(userId: string): Promise<string> {
  const profileResults = await db
    .select()
    .from(coachProfiles)
    .where(eq(coachProfiles.userId, userId))
    .limit(1);

  const defaultProfile: CoachProfile = {
    agentName: 'Coach',
    voiceId: 'alloy',
    jargonLevel: 0.5,
    decisiveness: 0.7,
    tone: 'supportive',
  };

  const profile: CoachProfile =
    profileResults.length > 0 && profileResults[0]
      ? {
          agentName: profileResults[0].agentName,
          voiceId: profileResults[0].voiceId,
          jargonLevel: profileResults[0].jargonLevel,
          decisiveness: profileResults[0].decisiveness,
          tone: profileResults[0].tone,
        }
      : defaultProfile;

  const memories = await retrieveTopK(userId, 'what should I keep in mind today?', 4, 10, 0.1);

  const lines: string[] = [];
  lines.push('**Your Profile:**');
  lines.push(`- Name: ${profile.agentName}`);
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

  return lines.join('\n');
}

export async function getInitialSessionUpdate(userId: string): Promise<SessionUpdate> {
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
  const truncated = tokenEstimate > 1200 ? fullInstructions.slice(0, 4800) : fullInstructions;

  return {
    type: 'session.update',
    session: {
      instructions: truncated,
      voice: voiceId,
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
    },
  };
}
