import { db } from '../db/index.js';
import { coachMemories } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

export interface KnowledgeChunk {
  id: string;
  text: string;
  tags: string[];
  uploadId?: string | undefined;
  sourceType?: string | undefined;
  similarity: number;
}

/**
 * Retrieve relevant knowledge chunks for a query
 * Focuses specifically on user-uploaded knowledge
 */
export async function retrieveKnowledge(
  userId: string,
  query: string,
  k = 5
): Promise<KnowledgeChunk[]> {
  const { embedText } = await import('./embed.js');
  const queryEmbedding = await embedText(query);
  const embeddingLiteral = `'[${queryEmbedding.join(',')}]'::vector`;

  const results = await db
    .select({
      id: coachMemories.id,
      text: coachMemories.text,
      tags: coachMemories.tags,
      similarity: sql<number>`1 - (${coachMemories.embedding} <=> ${sql.raw(embeddingLiteral)})`,
    })
    .from(coachMemories)
    .where(
      and(
        eq(coachMemories.userId, userId),
        eq(coachMemories.kind, 'knowledge')
      )
    )
    .orderBy(sql`${coachMemories.embedding} <=> ${sql.raw(embeddingLiteral)}`)
    .limit(k);

  return results.map((row) => {
    const uploadTag = row.tags?.find((t) => t.startsWith('upload:'));
    const sourceTag = row.tags?.find((t) => ['youtube', 'pdf', 'text'].includes(t));

    return {
      id: row.id,
      text: row.text,
      tags: row.tags ?? [],
      uploadId: uploadTag?.split(':')[1],
      sourceType: sourceTag,
      similarity: row.similarity ?? 0,
    };
  });
}

/**
 * Build knowledge context for voice session
 * Returns formatted string with user's knowledge base
 * Token-aware: limits output to ~400 tokens (~1600 chars) to prevent context overflow
 */
export async function buildKnowledgeContext(
  userId: string,
  query?: string,
  maxTokens = 400
): Promise<string> {
  const searchQuery = query || 'trading strategy, setup, rules, patterns, concepts';
  const knowledge = await retrieveKnowledge(userId, searchQuery, 5);

  if (knowledge.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const header = '**User Knowledge Base:**\n';
  const instruction = 'Use this knowledge when coaching:\n';
  
  let currentLength = (header + instruction).length;
  const maxLength = maxTokens * 4; // ~4 chars per token estimate
  const chunks: string[] = [];

  for (const chunk of knowledge) {
    const sourceLabel =
      chunk.sourceType === 'youtube' ? '📺' : chunk.sourceType === 'pdf' ? '📄' : '📝';
    const preview = chunk.text.slice(0, 120).trim();
    const line = `• ${sourceLabel} ${preview}${chunk.text.length > 120 ? '...' : ''}\n`;

    if (currentLength + line.length > maxLength) {
      break;
    }

    chunks.push(line);
    currentLength += line.length;
  }

  if (chunks.length === 0) {
    return '';
  }

  lines.push(header);
  lines.push(instruction);
  lines.push(...chunks);

  return lines.join('');
}
