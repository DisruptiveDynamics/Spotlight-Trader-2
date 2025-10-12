export interface TextChunk {
  text: string;
  index: number;
  metadata: {
    charStart: number;
    charEnd: number;
    tokens: number;
  };
}

/**
 * Split text into semantic chunks optimized for embeddings
 * Uses recursive character splitting with overlap to preserve context
 */
export function chunkText(
  text: string,
  options: {
    maxTokens?: number;
    overlapTokens?: number;
    separators?: string[];
  } = {}
): TextChunk[] {
  const {
    maxTokens = 500,
    overlapTokens = 50,
    separators = ['\n\n', '\n', '. ', ' '],
  } = options;

  // Rough token estimation: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  const chunks: TextChunk[] = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    const remainingText = text.slice(currentPos);
    
    // If remaining text fits in one chunk
    if (remainingText.length <= maxChars) {
      chunks.push({
        text: remainingText,
        index: chunks.length,
        metadata: {
          charStart: currentPos,
          charEnd: text.length,
          tokens: Math.ceil(remainingText.length / 4),
        },
      });
      break;
    }

    // Find best split point using separators
    let splitPoint = findBestSplitPoint(remainingText, maxChars, separators);
    
    // If no good separator found, split at maxChars
    if (splitPoint === -1) {
      splitPoint = maxChars;
    }

    const chunkText = remainingText.slice(0, splitPoint).trim();
    
    chunks.push({
      text: chunkText,
      index: chunks.length,
      metadata: {
        charStart: currentPos,
        charEnd: currentPos + splitPoint,
        tokens: Math.ceil(chunkText.length / 4),
      },
    });

    // Move position forward, accounting for overlap
    currentPos += Math.max(splitPoint - overlapChars, 1);
  }

  return chunks;
}

/**
 * Find the best position to split text based on semantic boundaries
 */
function findBestSplitPoint(
  text: string,
  maxLength: number,
  separators: string[]
): number {
  for (const separator of separators) {
    const lastIndex = text.lastIndexOf(separator, maxLength);
    
    if (lastIndex !== -1 && lastIndex > maxLength * 0.5) {
      // Found a good separator in the latter half of max length
      return lastIndex + separator.length;
    }
  }

  return -1;
}

/**
 * Estimate token count using tiktoken-like approximation
 */
export function estimateTokens(text: string): number {
  // Simple estimation: ~4 chars per token for English
  // More accurate would be to use tiktoken library
  return Math.ceil(text.length / 4);
}
