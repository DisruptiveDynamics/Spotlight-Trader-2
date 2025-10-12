import { db } from '../db/index.js';
import { coachMemories, knowledgeUploads } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { extractYouTubeTranscript, isYouTubeUrl } from './youtube.js';
import { extractPDFText, isPDF } from './pdf.js';
import { chunkText } from './chunker.js';
import { batchGenerateEmbeddings } from './embedder.js';

export interface UploadResult {
  uploadId: string;
  chunksCreated: number;
  totalTokens: number;
  status: 'completed' | 'failed';
  error?: string;
}

/**
 * Process and upload knowledge from various sources
 * Handles YouTube, PDF, and raw text
 */
export async function uploadKnowledge(params: {
  userId: string;
  sourceType: 'youtube' | 'pdf' | 'text';
  source: string | Buffer;
  title?: string;
  tags?: string[];
}): Promise<UploadResult> {
  const uploadId = nanoid();
  const { userId, sourceType, source, title, tags = [] } = params;

  try {
    // Extract text based on source type
    let extractedText: string;
    let extractedTitle: string;
    let metadata: Record<string, any> = {};

    if (sourceType === 'youtube' && typeof source === 'string') {
      if (!isYouTubeUrl(source)) {
        throw new Error('Invalid YouTube URL');
      }
      const result = await extractYouTubeTranscript(source);
      extractedText = result.text;
      extractedTitle = title || result.title;
      metadata = { duration: result.duration, url: source };
    } else if (sourceType === 'pdf' && Buffer.isBuffer(source)) {
      if (!isPDF(source)) {
        throw new Error('Invalid PDF file');
      }
      const result = await extractPDFText(source);
      extractedText = result.text;
      extractedTitle = title || result.title;
      metadata = { pages: result.pages, ...result.metadata };
    } else if (sourceType === 'text' && typeof source === 'string') {
      extractedText = source;
      extractedTitle = title || 'Text Note';
    } else {
      throw new Error('Invalid source type or data');
    }

    // Create upload record
    await db.insert(knowledgeUploads).values({
      id: uploadId,
      userId,
      sourceType,
      sourceUrl: typeof source === 'string' ? source : null,
      title: extractedTitle,
      status: 'processing',
      metadata,
    });

    // Chunk the text
    const chunks = chunkText(extractedText, {
      maxTokens: 500,
      overlapTokens: 50,
    });

    if (chunks.length === 0) {
      throw new Error('No content to process');
    }

    // Generate embeddings in batches
    const chunkTexts = chunks.map(c => c.text);
    const embeddings = await batchGenerateEmbeddings(chunkTexts);
    const totalTokens = embeddings.reduce((sum, e) => sum + e.tokens, 0);

    // Store memories in database
    const memoryRecords = chunks.map((chunk, i) => ({
      id: nanoid(),
      userId,
      kind: 'knowledge' as const,
      text: chunk.text,
      tags: [
        ...tags,
        sourceType,
        `upload:${uploadId}`,
        extractedTitle,
      ],
      embedding: embeddings[i]!.embedding,
    }));

    await db.insert(coachMemories).values(memoryRecords);

    // Update upload status
    await db
      .update(knowledgeUploads)
      .set({
        status: 'completed',
        chunksCount: chunks.length,
      })
      .where(eq(knowledgeUploads.id, uploadId));

    return {
      uploadId,
      chunksCreated: chunks.length,
      totalTokens,
      status: 'completed',
    };
  } catch (error) {
    // Update upload status to failed
    await db
      .update(knowledgeUploads)
      .set({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .where(eq(knowledgeUploads.id, uploadId));

    return {
      uploadId,
      chunksCreated: 0,
      totalTokens: 0,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get upload history for a user
 */
export async function getUserUploads(userId: string) {
  return db
    .select()
    .from(knowledgeUploads)
    .where(eq(knowledgeUploads.userId, userId))
    .orderBy(desc(knowledgeUploads.createdAt))
    .limit(50);
}
