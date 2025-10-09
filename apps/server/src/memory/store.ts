import { db } from '../db/index.js';
import { coachMemories } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { embedText } from './embed.js';

export type MemoryKind = 'playbook' | 'glossary' | 'postmortem';

export interface Memory {
  id: string;
  userId: string;
  kind: MemoryKind;
  text: string;
  tags: string[];
  createdAt: Date;
}

export interface MemoryWithScore extends Memory {
  score: number;
}

export async function saveMemory(
  userId: string,
  kind: MemoryKind,
  text: string,
  tags: string[]
): Promise<string> {
  const id = nanoid();
  const embedding = await embedText(text);

  await db.insert(coachMemories).values({
    id,
    userId,
    kind,
    text,
    tags,
    embedding: embedding as unknown as number[],
  });

  return id;
}

export async function listMemories(
  userId: string,
  options?: {
    kind?: MemoryKind;
    limit?: number;
    tag?: string;
  }
): Promise<Memory[]> {
  const conditions = [eq(coachMemories.userId, userId)];

  if (options?.kind) {
    conditions.push(eq(coachMemories.kind, options.kind));
  }

  if (options?.tag) {
    conditions.push(sql`${options.tag} = ANY(${coachMemories.tags})`);
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const limit = options?.limit ?? 50;

  const results = await db
    .select({
      id: coachMemories.id,
      userId: coachMemories.userId,
      kind: coachMemories.kind,
      text: coachMemories.text,
      tags: coachMemories.tags,
      createdAt: coachMemories.createdAt,
    })
    .from(coachMemories)
    .where(whereClause)
    .orderBy(sql`${coachMemories.createdAt} DESC`)
    .limit(limit);

  return results.map((row) => ({
    id: row.id,
    userId: row.userId,
    kind: row.kind as MemoryKind,
    text: row.text,
    tags: row.tags ?? [],
    createdAt: row.createdAt ?? new Date(),
  }));
}

export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  await db
    .delete(coachMemories)
    .where(and(eq(coachMemories.id, memoryId), eq(coachMemories.userId, userId)));

  return true;
}

function jaccardSimilarity(tags1: string[], tags2: string[]): number {
  const set1 = new Set(tags1);
  const set2 = new Set(tags2);
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export async function retrieveTopK(
  userId: string,
  query: string,
  k = 4,
  decayHalfLifeDays = 10,
  diversityPenalty = 0.1
): Promise<MemoryWithScore[]> {
  const queryEmbedding = await embedText(query);
  const embeddingLiteral = `'[${queryEmbedding.join(',')}]'::vector`;

  const results = await db
    .select({
      id: coachMemories.id,
      userId: coachMemories.userId,
      kind: coachMemories.kind,
      text: coachMemories.text,
      tags: coachMemories.tags,
      createdAt: coachMemories.createdAt,
      similarity: sql<number>`1 - (${coachMemories.embedding} <=> ${sql.raw(embeddingLiteral)})`,
    })
    .from(coachMemories)
    .where(eq(coachMemories.userId, userId))
    .orderBy(sql`${coachMemories.embedding} <=> ${sql.raw(embeddingLiteral)}`)
    .limit(k * 3);

  const now = Date.now();
  const halfLifeMs = decayHalfLifeDays * 24 * 60 * 60 * 1000;

  const scored = results.map((row) => {
    const ageMs = now - (row.createdAt?.getTime() ?? now);
    const decayFactor = Math.exp(-(ageMs / halfLifeMs) * Math.log(2));
    const score = (row.similarity ?? 0) * decayFactor;

    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind as MemoryKind,
      text: row.text,
      tags: row.tags ?? [],
      createdAt: row.createdAt ?? new Date(),
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: MemoryWithScore[] = [];
  for (const candidate of scored) {
    if (selected.length >= k) {
      break;
    }

    let shouldAdd = true;
    for (const existing of selected) {
      const tagOverlap = jaccardSimilarity(candidate.tags, existing.tags);
      if (tagOverlap > 0.8) {
        shouldAdd = false;
        break;
      }
    }

    if (shouldAdd) {
      selected.push(candidate);
    }
  }

  while (selected.length < k && scored.length > selected.length) {
    const remaining = scored.filter((s) => !selected.includes(s));
    if (remaining.length === 0 || !remaining[0]) break;
    selected.push(remaining[0]);
  }

  return selected;
}
