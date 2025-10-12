import { saveMemory, MemoryKind } from '../memory/store';

interface ConversationInsight {
  userId: string;
  text: string;
  kind: MemoryKind;
  tags: string[];
  timestamp: number;
}

class VoiceMemoryBridge {
  private insightBuffer: Map<string, ConversationInsight[]> = new Map();
  private readonly FLUSH_INTERVAL_MS = 30000; // Flush every 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startFlushTimer();
  }

  async captureInsight(
    userId: string,
    text: string,
    kind: MemoryKind,
    tags: string[] = []
  ): Promise<void> {
    const insight: ConversationInsight = {
      userId,
      text,
      kind,
      tags,
      timestamp: Date.now(),
    };

    if (!this.insightBuffer.has(userId)) {
      this.insightBuffer.set(userId, []);
    }

    this.insightBuffer.get(userId)!.push(insight);

    console.log('[VoiceMemoryBridge] Captured insight:', {
      userId,
      kind,
      tags,
      textPreview: text.slice(0, 50),
    });

    // Flush immediately if buffer is large
    const userInsights = this.insightBuffer.get(userId)!;
    if (userInsights.length >= 5) {
      await this.flushUserInsights(userId);
    }
  }

  async captureTraderPattern(
    userId: string,
    pattern: string,
    context: string
  ): Promise<void> {
    const text = `Trader pattern: ${pattern}. Context: ${context}`;
    await this.captureInsight(userId, text, 'postmortem', ['pattern', 'behavior']);
  }

  async captureSetupLearning(
    userId: string,
    symbol: string,
    setup: string,
    learning: string
  ): Promise<void> {
    const text = `${symbol} ${setup}: ${learning}`;
    await this.captureInsight(userId, text, 'playbook', [symbol, setup, 'learning']);
  }

  async captureMistake(
    userId: string,
    mistake: string,
    lesson: string
  ): Promise<void> {
    const text = `Mistake: ${mistake}. Lesson: ${lesson}`;
    await this.captureInsight(userId, text, 'postmortem', ['mistake', 'lesson']);
  }

  private async flushUserInsights(userId: string): Promise<void> {
    const insights = this.insightBuffer.get(userId);
    if (!insights || insights.length === 0) return;

    console.log(`[VoiceMemoryBridge] Flushing ${insights.length} insights for user ${userId}`);

    // Save each insight to memory store
    const savePromises = insights.map(insight =>
      saveMemory(insight.userId, insight.kind, insight.text, insight.tags)
    );

    try {
      await Promise.all(savePromises);
      this.insightBuffer.set(userId, []); // Clear buffer after successful save
      console.log(`[VoiceMemoryBridge] Successfully saved ${insights.length} insights`);
    } catch (error) {
      console.error('[VoiceMemoryBridge] Failed to save insights:', error);
      // Keep insights in buffer for retry
    }
  }

  private async flushAllInsights(): Promise<void> {
    const userIds = Array.from(this.insightBuffer.keys());
    
    for (const userId of userIds) {
      await this.flushUserInsights(userId);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushAllInsights().catch(err => {
        console.error('[VoiceMemoryBridge] Flush timer error:', err);
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flushAllInsights();
  }

  getBufferSize(userId?: string): number {
    if (userId) {
      return this.insightBuffer.get(userId)?.length || 0;
    }
    return Array.from(this.insightBuffer.values()).reduce((sum, arr) => sum + arr.length, 0);
  }
}

export const voiceMemoryBridge = new VoiceMemoryBridge();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[VoiceMemoryBridge] Shutting down, flushing insights...');
  await voiceMemoryBridge.shutdown();
});
