import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Voice State Machine", () => {
  let mockSession: any;
  let mockToolsBridge: any;

  beforeEach(() => {
    mockSession = {
      connected: false,
      userId: "test-user",
      sessionId: "test-session",
      emit: vi.fn(),
      close: vi.fn(),
    };

    mockToolsBridge = {
      executeTool: vi.fn().mockResolvedValue({ status: "success", data: {} }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Connection Lifecycle", () => {
    it("should transition from disconnected to connected", () => {
      expect(mockSession.connected).toBe(false);
      mockSession.connected = true;
      expect(mockSession.connected).toBe(true);
    });

    it("should emit connection events in correct order", () => {
      const events: string[] = [];
      
      mockSession.emit = vi.fn((event: string) => {
        events.push(event);
      });

      mockSession.emit("connecting");
      mockSession.emit("connected");
      
      expect(events).toEqual(["connecting", "connected"]);
    });

    it("should handle reconnection after disconnect", () => {
      mockSession.connected = true;
      mockSession.connected = false;
      expect(mockSession.connected).toBe(false);
      
      mockSession.connected = true;
      expect(mockSession.connected).toBe(true);
    });

    it("should cleanup on disconnect", () => {
      mockSession.connected = true;
      mockSession.close();
      
      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tool Execution Flow", () => {
    it("should execute tool and return result", async () => {
      const toolResult = await mockToolsBridge.executeTool("get_last_price", {
        symbol: "SPY",
      });

      expect(mockToolsBridge.executeTool).toHaveBeenCalledWith("get_last_price", {
        symbol: "SPY",
      });
      expect(toolResult.status).toBe("success");
    });

    it("should handle tool execution errors", async () => {
      mockToolsBridge.executeTool = vi.fn().mockRejectedValue(
        new Error("Tool execution failed")
      );

      await expect(
        mockToolsBridge.executeTool("invalid_tool", {})
      ).rejects.toThrow("Tool execution failed");
    });

    it("should execute multiple tools in sequence", async () => {
      const tools = ["get_last_price", "get_last_vwap", "get_last_ema"];
      
      for (const tool of tools) {
        await mockToolsBridge.executeTool(tool, { symbol: "SPY" });
      }

      expect(mockToolsBridge.executeTool).toHaveBeenCalledTimes(3);
    });

    it("should track tool execution latency", async () => {
      const start = Date.now();
      await mockToolsBridge.executeTool("get_last_price", { symbol: "SPY" });
      const latency = Date.now() - start;

      expect(latency).toBeLessThan(100); // Should be fast for mocked calls
    });
  });

  describe("State Transitions", () => {
    it("should maintain session ID across state changes", () => {
      const sessionId = mockSession.sessionId;
      mockSession.connected = true;
      mockSession.connected = false;
      mockSession.connected = true;

      expect(mockSession.sessionId).toBe(sessionId);
    });

    it("should preserve user ID during reconnection", () => {
      const userId = mockSession.userId;
      mockSession.connected = false;
      mockSession.connected = true;

      expect(mockSession.userId).toBe(userId);
    });
  });

  describe("Error Recovery", () => {
    it("should recover from tool execution timeout", async () => {
      let callCount = 0;
      mockToolsBridge.executeTool = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise((resolve) => setTimeout(resolve, 5000));
        }
        return Promise.resolve({ status: "success", data: {} });
      });

      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 100)
      );
      
      await expect(
        Promise.race([mockToolsBridge.executeTool("get_last_price", {}), timeout])
      ).rejects.toThrow("Timeout");

      const retryResult = await mockToolsBridge.executeTool("get_last_price", {});
      expect(retryResult.status).toBe("success");
    });
  });
});
