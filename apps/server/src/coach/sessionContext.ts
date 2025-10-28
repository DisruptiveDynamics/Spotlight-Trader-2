import { eq } from "drizzle-orm";

import { VOICE_COACH_SYSTEM } from "./policy.js";
import { db } from "../db/index.js";
import { coachProfiles } from "../db/schema.js";
import { buildKnowledgeContext } from "../memory/knowledgeRetrieval.js";
import { retrieveTopK } from "../memory/store.js";
import { VOICE_COPILOT_TOOLS } from "../realtime/voiceTools.js";

interface CoachProfile {
  agentName: string;
  pronouns: string;
  voiceId: string;
  personality: string;
  jargonLevel: number;
  decisiveness: number;
  tone: string;
}

// Tiny cache so reconnects are snappy; invalidated by profile hash
const ctxCache = new Map<string, { at: number; value: string; hash: string }>();
const CTX_TTL_MS = 30_000;

function profileHash(p: CoachProfile) {
  return `${p.voiceId}|${p.tone}|${p.personality}|${p.jargonLevel}|${p.decisiveness}`;
}

async function loadProfile(userId: string): Promise<CoachProfile> {
  const profileResults = await db
    .select()
    .from(coachProfiles)
    .where(eq(coachProfiles.userId, userId))
    .limit(1);

  const defaultProfile: CoachProfile = {
    agentName: "Nexa",
    pronouns: "she/her",
    voiceId: "nova",
    personality: "warm and intelligent",
    jargonLevel: 0.5,
    decisiveness: 0.7,
    tone: "supportive",
  };

  const row = profileResults[0];
  if (!row) return defaultProfile;

  return {
    agentName: row.agentName || defaultProfile.agentName,
    pronouns: row.pronouns || defaultProfile.pronouns,
    voiceId: row.voiceId || defaultProfile.voiceId,
    personality: row.personality || defaultProfile.personality,
    jargonLevel:
      typeof row.jargonLevel === "number" && !Number.isNaN(row.jargonLevel)
        ? Math.max(0, Math.min(1, row.jargonLevel))
        : defaultProfile.jargonLevel,
    decisiveness:
      typeof row.decisiveness === "number" && !Number.isNaN(row.decisiveness)
        ? Math.max(0, Math.min(1, row.decisiveness))
        : defaultProfile.decisiveness,
    tone: row.tone || defaultProfile.tone,
  };
}

export async function buildSessionContext(userId: string): Promise<string> {
  const profile = await loadProfile(userId);
  const hash = profileHash(profile);
  const cached = ctxCache.get(userId);
  const now = Date.now();
  if (cached && cached.hash === hash && now - cached.at < CTX_TTL_MS) {
    return cached.value;
  }

  const [memories, knowledgeContext] = await Promise.all([
    retrieveTopK(userId, "what should I keep in mind today?", 4, 10, 0.1),
    buildKnowledgeContext(userId),
  ]);

  const lines: string[] = [];
  lines.push("[[session_context]]"); // guardrail: don't echo outside
  lines.push("identity:");
  lines.push(`  name: ${profile.agentName}`);
  lines.push(`  pronouns: ${profile.pronouns}`);
  lines.push(`  personality: ${profile.personality}`);
  lines.push(`  voice: ${profile.voiceId}`);
  lines.push(`  tone: ${profile.tone}`);
  lines.push(`  jargon_level: ${profile.jargonLevel > 0.7 ? "high" : profile.jargonLevel > 0.4 ? "medium" : "low"}`);
  lines.push(`  decisiveness: ${profile.decisiveness > 0.7 ? "high" : profile.decisiveness > 0.4 ? "medium" : "low"}`);

  if (memories?.length > 0) {
    lines.push("");
    lines.push("key_memories:");
    memories.forEach((mem, idx) => {
      const preview = (mem.text || "").slice(0, 120).replace(/\s+/g, " ").trim();
      lines.push(`  - id: ${idx + 1}`);
      lines.push(`    kind: ${mem.kind || "note"}`);
      lines.push(`    text: "${preview}${(mem.text || "").length > 120 ? "..." : ""}"`);
    });
  }

  if (knowledgeContext) {
    lines.push("");
    lines.push("knowledge:");
    for (const line of knowledgeContext.split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  // Tool discipline anchors (force tool-backed numbers)
  lines.push("");
  lines.push("tool_policy:");
  lines.push(`  - Always call tools for numbers (price, VWAP, indicators).`);
  lines.push(`  - Prefer micro tools for single metrics if available.`);
  lines.push(`  - Before speaking numbers, check market status.`);
  lines.push(`  - If tools are unavailable or not ready, say you are reconnecting; do not guess.`);
  lines.push("[[/session_context]]");

  const value = lines.join("\n");
  ctxCache.set(userId, { at: now, value, hash });
  return value;
}

// Fast initial session - tools ready immediately, minimal context
export async function getMinimalSessionUpdate(userId: string) {
  const profile = await loadProfile(userId);
  const now = new Date();
  const timeContext = `Current date/time: ${now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })}`;

  const minimalInstructions =
    `${VOICE_COACH_SYSTEM}\n\n` +
    `${timeContext}\n\n` +
    `You are Nexa, an intraday trading copilot.\n` +
    `Be ultra-brief. Use tools when discussing specific market data.\n` +
    `- Use micro tools for last price/VWAP when available.\n` +
    `- If market/tools not ready, say you're reconnecting and avoid numbers.\n` +
    `- Never invent prices or indicators.`;

  return {
    type: "session.update",
    session: {
      instructions: minimalInstructions,
      modalities: ["text", "audio"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      voice: profile.voiceId,
      tools: VOICE_COPILOT_TOOLS,
      temperature: 0.1,
      max_response_output_tokens: 120,
    },
  };
}

// Full context update - sent after session is live
export async function getInitialSessionUpdate(userId: string) {
  const profile = await loadProfile(userId);
  const contextBlock = await buildSessionContext(userId);
  const now = new Date();
  const timeContext = `Current date/time: ${now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })}`;

  const fullInstructions =
    `${VOICE_COACH_SYSTEM}\n\n` +
    `${timeContext}\n\n` +
    `${contextBlock}\n\n` +
    `Execution rules:\n` +
    `- Use tools when discussing specific prices/VWAP/indicators.\n` +
    `- Check market readiness; if not ready, announce reconnect and avoid numeric claims.\n` +
    `- Cite which tool and symbol you used when answering.\n` +
    `- Keep replies concise.`;

  const tokenEstimate = Math.ceil(fullInstructions.length / 4);
  const instructions = tokenEstimate > 1400 ? fullInstructions.slice(0, 5600) : fullInstructions;

  return {
    type: "session.update",
    session: {
      instructions,
      modalities: ["text", "audio"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      voice: profile.voiceId,
      tools: VOICE_COPILOT_TOOLS,
      temperature: 0.1,
      max_response_output_tokens: 150,
    },
  };
}
