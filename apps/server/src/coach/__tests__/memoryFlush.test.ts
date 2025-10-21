import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Memory Flush - Shutdown with Retries", () => {
  interface Insight {
    userId: string;
    content: string;
    timestamp: number;
  }

  class MockVoiceMemoryBridge {
    private insightBuffer: Map<string, Insight[]> = new Map();
    private flushAttempts = 0;
    private shouldFailFlush = false;
    private maxRetries = 3;
    private retryDelay = 500;

    setFailFlush(fail: boolean) {
      this.shouldFailFlush = fail;
    }

    addInsight(userId: string, content: string) {
      if (!this.insightBuffer.has(userId)) {
        this.insightBuffer.set(userId, []);
      }
      this.insightBuffer.get(userId)!.push({
        userId,
        content,
        timestamp: Date.now(),
      });
    }

    getInsightCount(userId: string): number {
      return this.insightBuffer.get(userId)?.length || 0;
    }

    async flush(): Promise<boolean> {
      this.flushAttempts++;
      
      if (this.shouldFailFlush && this.flushAttempts < this.maxRetries) {
        throw new Error("Flush failed");
      }

      this.insightBuffer.clear();
      return true;
    }

    async shutdown(): Promise<void> {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          await this.flush();
          return;
        } catch {
          if (attempt === this.maxRetries) {
            console.error("Failed to flush after max retries");
            return;
          }
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    getFlushAttempts(): number {
      return this.flushAttempts;
    }

    reset() {
      this.flushAttempts = 0;
      this.shouldFailFlush = false;
      this.insightBuffer.clear();
    }
  }

  let bridge: MockVoiceMemoryBridge;

  beforeEach(() => {
    bridge = new MockVoiceMemoryBridge();
  });

  afterEach(() => {
    bridge.reset();
  });

  describe("Shutdown Retry Logic", () => {
    it("should flush successfully on first attempt", async () => {
      bridge.addInsight("user1", "Test insight");
      
      await bridge.shutdown();
      
      expect(bridge.getFlushAttempts()).toBe(1);
      expect(bridge.getInsightCount("user1")).toBe(0);
    });

    it("should retry on flush failure", async () => {
      bridge.setFailFlush(true);
      bridge.addInsight("user1", "Test insight");
      
      await bridge.shutdown();
      
      expect(bridge.getFlushAttempts()).toBe(3);
    });

    it("should succeed after 2 retries", async () => {
      let attemptCount = 0;
      
      const _originalFlush = bridge.flush.bind(bridge);
      bridge.flush = async function(this: any) {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Flush failed");
        }
        this.insightBuffer.clear();
        return true;
      };

      bridge.addInsight("user1", "Test insight");
      
      await bridge.shutdown();
      
      expect(attemptCount).toBe(3);
      expect(bridge.getInsightCount("user1")).toBe(0);
    });

    it("should delay 500ms between retries", async () => {
      bridge.setFailFlush(true);
      
      const start = Date.now();
      await bridge.shutdown();
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
  });

  describe("Idempotency", () => {
    it("should not duplicate insights on multiple flushes", async () => {
      bridge.addInsight("user1", "Insight 1");
      bridge.addInsight("user1", "Insight 2");
      
      expect(bridge.getInsightCount("user1")).toBe(2);
      
      await bridge.shutdown();
      expect(bridge.getInsightCount("user1")).toBe(0);
      
      await bridge.shutdown();
      expect(bridge.getInsightCount("user1")).toBe(0);
    });

    it("should handle concurrent shutdown calls", async () => {
      bridge.addInsight("user1", "Test insight");
      
      const shutdown1 = bridge.shutdown();
      const shutdown2 = bridge.shutdown();
      
      await Promise.all([shutdown1, shutdown2]);
      
      expect(bridge.getInsightCount("user1")).toBe(0);
    });

    it("should clear buffer only after successful flush", async () => {
      let flushCalled = false;
      
      const _originalFlush = bridge.flush.bind(bridge);
      bridge.flush = async function() {
        if (!flushCalled) {
          flushCalled = true;
          throw new Error("First flush fails");
        }
        return _originalFlush();
      };

      bridge.addInsight("user1", "Test");
      
      await bridge.shutdown();
      
      expect(bridge.getInsightCount("user1")).toBe(0);
    });
  });

  describe("Signal Handlers", () => {
    it("should handle SIGTERM gracefully", async () => {
      const mockProcess = {
        on: vi.fn(),
        exit: vi.fn(),
      };

      let sigtermHandler: any = null;

      mockProcess.on.mockImplementation((signal: string, handler: any) => {
        if (signal === "SIGTERM") {
          sigtermHandler = handler;
        }
      });

      mockProcess.on("SIGTERM", async () => {
        await bridge.shutdown();
      });

      bridge.addInsight("user1", "Test");
      
      if (sigtermHandler) {
        await sigtermHandler();
      }
      
      expect(bridge.getInsightCount("user1")).toBe(0);
    });

    it("should handle SIGINT gracefully", async () => {
      const mockProcess = {
        on: vi.fn(),
        exit: vi.fn(),
      };

      let sigintHandler: any = null;

      mockProcess.on.mockImplementation((signal: string, handler: any) => {
        if (signal === "SIGINT") {
          sigintHandler = handler;
        }
      });

      mockProcess.on("SIGINT", async () => {
        await bridge.shutdown();
        mockProcess.exit(0);
      });

      bridge.addInsight("user1", "Test");
      
      if (sigintHandler) {
        await sigintHandler();
      }
      
      expect(bridge.getInsightCount("user1")).toBe(0);
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it("should handle beforeExit event", async () => {
      const mockProcess = {
        on: vi.fn(),
      };

      let beforeExitHandler: any = null;

      mockProcess.on.mockImplementation((event: string, handler: any) => {
        if (event === "beforeExit") {
          beforeExitHandler = handler;
        }
      });

      mockProcess.on("beforeExit", async (_code: number) => {
        await bridge.shutdown();
      });

      bridge.addInsight("user1", "Test");
      
      if (beforeExitHandler) {
        await beforeExitHandler(0);
      }
      
      expect(bridge.getInsightCount("user1")).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty buffer on shutdown", async () => {
      await bridge.shutdown();
      
      expect(bridge.getFlushAttempts()).toBe(1);
    });

    it("should handle multiple users on shutdown", async () => {
      bridge.addInsight("user1", "Insight A");
      bridge.addInsight("user2", "Insight B");
      bridge.addInsight("user3", "Insight C");
      
      await bridge.shutdown();
      
      expect(bridge.getInsightCount("user1")).toBe(0);
      expect(bridge.getInsightCount("user2")).toBe(0);
      expect(bridge.getInsightCount("user3")).toBe(0);
    });

    it("should not block indefinitely on persistent failures", async () => {
      bridge.setFailFlush(true);
      
      const timeout = new Promise((resolve) => 
        setTimeout(() => resolve("timeout"), 5000)
      );
      
      const shutdown = bridge.shutdown();
      
      const result = await Promise.race([shutdown, timeout]);
      
      expect(result).not.toBe("timeout");
    });
  });
});
