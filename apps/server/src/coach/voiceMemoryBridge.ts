import { saveMemory, MemoryKind } from "../memory/store";

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
    tags: string[] = [],
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

    console.log("[VoiceMemoryBridge] Captured insight:", {
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

  async captureTraderPattern(userId: string, pattern: string, context: string): Promise<void> {
    const text = `Trader pattern: ${pattern}. Context: ${context}`;
    await this.captureInsight(userId, text, "postmortem", ["pattern", "behavior"]);
  }

  async captureSetupLearning(
    userId: string,
    symbol: string,
    setup: string,
    learning: string,
  ): Promise<void> {
    const text = `${symbol} ${setup}: ${learning}`;
    await this.captureInsight(userId, text, "playbook", [symbol, setup, "learning"]);
  }

  async captureMistake(userId: string, mistake: string, lesson: string): Promise<void> {
    const text = `Mistake: ${mistake}. Lesson: ${lesson}`;
    await this.captureInsight(userId, text, "postmortem", ["mistake", "lesson"]);
  }

  private async flushUserInsights(userId: string): Promise<void> {
    const insights = this.insightBuffer.get(userId);
    if (!insights || insights.length === 0) return;

    console.log(`[VoiceMemoryBridge] Flushing ${insights.length} insights for user ${userId}`);

    // Save each insight to memory store
    const savePromises = insights.map((insight) =>
      saveMemory(insight.userId, insight.kind, insight.text, insight.tags),
    );

    try {
      await Promise.all(savePromises);
      this.insightBuffer.set(userId, []); // Clear buffer after successful save
      console.log(`[VoiceMemoryBridge] Successfully saved ${insights.length} insights`);
    } catch (error) {
      console.error("[VoiceMemoryBridge] Failed to save insights:", error);
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
      this.flushAllInsights().catch((err) => {
        console.error("[VoiceMemoryBridge] Flush timer error:", err);
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * [PHASE-8] Graceful shutdown with retry logic
   * Attempts to flush all insights with up to 3 retries before giving up
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[VoiceMemoryBridge] Shutdown flush attempt ${attempt}/${MAX_RETRIES}`);
        await this.flushAllInsights();
        console.log(`[VoiceMemoryBridge] Shutdown flush successful on attempt ${attempt}`);
        return;
      } catch (err) {
        console.error(`[VoiceMemoryBridge] Shutdown flush attempt ${attempt} failed:`, err);
        
        if (attempt < MAX_RETRIES) {
          console.log(`[VoiceMemoryBridge] Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
          console.error(`[VoiceMemoryBridge] All ${MAX_RETRIES} flush attempts failed - data may be lost`);
        }
      }
    }
  }

  getBufferSize(userId?: string): number {
    if (userId) {
      return this.insightBuffer.get(userId)?.length || 0;
    }
    return Array.from(this.insightBuffer.values()).reduce((sum, arr) => sum + arr.length, 0);
  }
}

export const voiceMemoryBridge = new VoiceMemoryBridge();

// [PHASE-8] Graceful shutdown handlers for all exit scenarios
process.on("SIGTERM", async () => {
  console.log("[VoiceMemoryBridge] SIGTERM received, flushing insights...");
  await voiceMemoryBridge.shutdown();
});

process.on("SIGINT", async () => {
  console.log("[VoiceMemoryBridge] SIGINT received, flushing insights...");
  await voiceMemoryBridge.shutdown();
  process.exit(0);
});

process.on("beforeExit", async (code) => {
  console.log(`[VoiceMemoryBridge] beforeExit (code ${code}), flushing insights...`);
  await voiceMemoryBridge.shutdown();
});
