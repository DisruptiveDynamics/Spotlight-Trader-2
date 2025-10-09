import { z } from 'zod';

export const barSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  seq: z.number(),
  bar_start: z.number(),
  bar_end: z.number(),
});

export const alertSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  ruleId: z.string(),
  ruleVersion: z.string(),
  confidence: z.number().min(0).max(1),
  message: z.string(),
  timestamp: z.number(),
});

export const coachProfileSchema = z.object({
  userId: z.string(),
  agentName: z.string(),
  voiceId: z.string(),
  jargonLevel: z.number().min(0).max(1),
  decisiveness: z.number().min(0).max(1),
  tone: z.string(),
});
