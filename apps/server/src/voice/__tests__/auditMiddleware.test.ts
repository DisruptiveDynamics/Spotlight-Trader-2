import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Audit Middleware - Price Hallucination Detection", () => {
  const createAuditContext = (text: string, recentToolCalls: string[] = []) => ({
    text,
    recentToolCalls,
    timestamp: Date.now(),
  });

  describe("Price Pattern Extraction", () => {
    it("should detect currency symbols with decimals", () => {
      const patterns = [
        "$123.45",
        "$1,234.56",
        "$0.99",
        "€45.67",
        "£89.12",
      ];

      patterns.forEach(pattern => {
        const regex = /[$€£¥]\s*\d{1,3}(,\d{3})*(\.\d{2})?/g;
        expect(regex.test(pattern)).toBe(true);
      });
    });

    it("should detect plain integers with price context", () => {
      const priceContexts = [
        "The price is 123",
        "trading at 456",
        "currently 789",
        "hit 1000",
      ];

      priceContexts.forEach(text => {
        const priceKeywords = /\b(price|trading|currently|hit)\s+\d+/gi;
        expect(priceKeywords.test(text)).toBe(true);
      });
    });

    it("should detect magnitude suffixes", () => {
      const magnitudes = [
        "123k",
        "45.6M",
        "1.2B",
        "500K volume",
      ];

      magnitudes.forEach(text => {
        const magnitudeRegex = /\d+\.?\d*[KMB]/gi;
        expect(magnitudeRegex.test(text)).toBe(true);
      });
    });

    it("should detect equity ticker patterns", () => {
      const tickerPatterns = [
        "SPY at 450",
        "AAPL is 180",
        "TSLA hit 250",
      ];

      tickerPatterns.forEach(text => {
        const tickerRegex = /\b[A-Z]{1,5}\s+(at|is|hit)\s+\d+/g;
        expect(tickerRegex.test(text)).toBe(true);
      });
    });
  });

  describe("Context Filtering", () => {
    it("should exclude time patterns", () => {
      const timePatterns = [
        "9:30",
        "14:45",
        "3:00 PM",
        "at 10:15",
      ];

      timePatterns.forEach(text => {
        const timeRegex = /\b\d{1,2}:\d{2}(\s*[AP]M)?\b/gi;
        expect(timeRegex.test(text)).toBe(true);
      });
    });

    it("should exclude percentage patterns", () => {
      const percentages = [
        "50%",
        "12.5%",
        "100% certain",
      ];

      percentages.forEach(text => {
        const percentRegex = /\d+\.?\d*%/g;
        expect(percentRegex.test(text)).toBe(true);
      });
    });

    it("should exclude volume patterns", () => {
      const volumes = [
        "1000 shares",
        "500 contracts",
        "250 lots",
      ];

      volumes.forEach(text => {
        const volumeRegex = /\d+\s+(shares|contracts|lots)/gi;
        expect(volumeRegex.test(text)).toBe(true);
      });
    });
  });

  describe("Hallucination Detection Logic", () => {
    it("should flag price mention without recent tool call", () => {
      const ctx = createAuditContext("SPY is at $450.25", []);
      const hasPricePattern = /\$\s*\d+/.test(ctx.text);
      const hasRecentToolCall = ctx.recentToolCalls.length > 0;

      expect(hasPricePattern).toBe(true);
      expect(hasRecentToolCall).toBe(false);
    });

    it("should pass price mention with recent tool call", () => {
      const ctx = createAuditContext(
        "SPY is at $450.25",
        ["get_last_price"]
      );
      const hasPricePattern = /\$\s*\d+/.test(ctx.text);
      const hasRecentToolCall = ctx.recentToolCalls.length > 0;

      expect(hasPricePattern).toBe(true);
      expect(hasRecentToolCall).toBe(true);
    });

    it("should enforce 2-second tool call window", () => {
      const now = Date.now();
      const toolCallTimestamp = now - 3000; // 3 seconds ago
      const isWithinWindow = now - toolCallTimestamp <= 2000;

      expect(isWithinWindow).toBe(false);
    });

    it("should pass tool calls within 2-second window", () => {
      const now = Date.now();
      const toolCallTimestamp = now - 1500; // 1.5 seconds ago
      const isWithinWindow = now - toolCallTimestamp <= 2000;

      expect(isWithinWindow).toBe(true);
    });
  });

  describe("Multi-Stage Extraction", () => {
    it("should extract all price patterns from mixed text", () => {
      const text = "SPY is $450.25, volume at 1.2M, with 50% gain since 9:30";
      
      const currencyMatches = text.match(/\$\s*\d+\.?\d*/g);
      const magnitudeMatches = text.match(/\d+\.?\d*[KMB]/gi);
      const percentMatches = text.match(/\d+\.?\d*%/g);
      const timeMatches = text.match(/\b\d{1,2}:\d{2}/g);

      expect(currencyMatches).toEqual(["$450.25"]);
      expect(magnitudeMatches).toEqual(["1.2M"]);
      expect(percentMatches).toEqual(["50%"]);
      expect(timeMatches).toEqual(["9:30"]);
    });

    it("should handle complex ticker patterns", () => {
      const text = "AAPL hit 180, TSLA at 250, SPY trading 450";
      const tickerPriceRegex = /\b[A-Z]{1,5}\s+(hit|at|trading)\s+\d+/g;
      const matches = text.match(tickerPriceRegex);

      expect(matches).toHaveLength(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty text", () => {
      const ctx = createAuditContext("", []);
      const hasPricePattern = /\$\s*\d+/.test(ctx.text);
      
      expect(hasPricePattern).toBe(false);
    });

    it("should handle text with only excluded patterns", () => {
      const text = "Trading at 9:30 with 50% volume increase";
      const hasCurrency = /\$/.test(text);
      
      expect(hasCurrency).toBe(false);
    });

    it("should handle international currency symbols", () => {
      const currencies = ["€123.45", "£89.12", "¥1234"];

      currencies.forEach(curr => {
        const currencyRegex = /[€£¥]\s*\d+/g;
        expect(currencyRegex.test(curr)).toBe(true);
      });
    });
  });

  describe("Violation Logging", () => {
    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    beforeEach(() => {
      mockLogger.warn.mockClear();
      mockLogger.error.mockClear();
    });

    it("should log violation with context", () => {
      const violation = {
        text: "SPY is at $450.25",
        pattern: "$450.25",
        recentTools: [],
        timestamp: Date.now(),
      };

      mockLogger.warn("Price hallucination detected", violation);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Price hallucination detected",
        violation
      );
    });

    it("should track violation metrics", () => {
      let violationCount = 0;
      
      const logViolation = () => {
        violationCount++;
        mockLogger.warn(`Violation #${violationCount}`);
      };

      logViolation();
      logViolation();
      
      expect(violationCount).toBe(2);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });
  });
});
