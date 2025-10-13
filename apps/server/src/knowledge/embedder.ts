import { validateEnv } from "@shared/env";

const env = validateEnv(process.env);

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

/**
 * Generate embeddings using OpenAI's text-embedding-3-small model
 * Optimized for cost ($0.02/1M tokens) and quality (1536 dimensions)
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small",
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };

    if (!data.data || data.data.length === 0) {
      throw new Error("No embedding returned from OpenAI");
    }

    return {
      embedding: data.data[0]!.embedding,
      tokens: data.usage.total_tokens,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
    throw new Error("Failed to generate embedding");
  }
}

/**
 * Batch generate embeddings for multiple texts
 * Processes up to 100 texts per request (OpenAI limit)
 */
export async function batchGenerateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
  const BATCH_SIZE = 100;
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: batch,
          model: "text-embedding-3-small",
          dimensions: 1536,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
        usage: { total_tokens: number };
      };

      for (let j = 0; j < data.data.length; j++) {
        results.push({
          embedding: data.data[j]!.embedding,
          tokens: Math.ceil(data.usage.total_tokens / data.data.length),
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Batch embedding failed: ${error.message}`);
      }
      throw new Error("Batch embedding failed");
    }
  }

  return results;
}
