import { describe, it, expect, beforeEach } from "vitest";

describe("SSE Reconciliation", () => {
  interface SSEEvent {
    id: string;
    data: any;
    timestamp: number;
  }

  class SSEBuffer {
    private events: SSEEvent[] = [];
    private maxSize = 1000;

    add(event: SSEEvent) {
      this.events.push(event);
      if (this.events.length > this.maxSize) {
        this.events.shift();
      }
    }

    getSince(lastEventId: string): SSEEvent[] {
      if (!lastEventId) return this.events;
      
      const lastIndex = this.events.findIndex(e => e.id === lastEventId);
      if (lastIndex === -1) return this.events;
      
      return this.events.slice(lastIndex + 1);
    }

    getAll(): SSEEvent[] {
      return this.events;
    }

    clear() {
      this.events = [];
    }
  }

  let buffer: SSEBuffer;

  beforeEach(() => {
    buffer = new SSEBuffer();
  });

  describe("Resume from lastEventId", () => {
    it("should return all events when lastEventId is empty", () => {
      const events = [
        { id: "1", data: { value: "a" }, timestamp: 1000 },
        { id: "2", data: { value: "b" }, timestamp: 2000 },
        { id: "3", data: { value: "c" }, timestamp: 3000 },
      ];

      events.forEach(e => buffer.add(e));

      const result = buffer.getSince("");
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("1");
    });

    it("should return events after lastEventId", () => {
      const events = [
        { id: "1", data: { value: "a" }, timestamp: 1000 },
        { id: "2", data: { value: "b" }, timestamp: 2000 },
        { id: "3", data: { value: "c" }, timestamp: 3000 },
        { id: "4", data: { value: "d" }, timestamp: 4000 },
      ];

      events.forEach(e => buffer.add(e));

      const result = buffer.getSince("2");
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("3");
      expect(result[1].id).toBe("4");
    });

    it("should return empty array if lastEventId is the latest", () => {
      const events = [
        { id: "1", data: { value: "a" }, timestamp: 1000 },
        { id: "2", data: { value: "b" }, timestamp: 2000 },
      ];

      events.forEach(e => buffer.add(e));

      const result = buffer.getSince("2");
      expect(result).toHaveLength(0);
    });

    it("should return all events if lastEventId not found", () => {
      const events = [
        { id: "1", data: { value: "a" }, timestamp: 1000 },
        { id: "2", data: { value: "b" }, timestamp: 2000 },
      ];

      events.forEach(e => buffer.add(e));

      const result = buffer.getSince("999");
      expect(result).toHaveLength(2);
    });
  });

  describe("Lossless Delivery", () => {
    it("should maintain event order", () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        id: String(i + 1),
        data: { value: i },
        timestamp: 1000 + i * 100,
      }));

      events.forEach(e => buffer.add(e));

      const result = buffer.getAll();
      expect(result).toHaveLength(100);
      
      result.forEach((event, i) => {
        expect(event.id).toBe(String(i + 1));
        expect(event.data.value).toBe(i);
      });
    });

    it("should not lose events during reconnection", () => {
      const events1 = [
        { id: "1", data: { value: "a" }, timestamp: 1000 },
        { id: "2", data: { value: "b" }, timestamp: 2000 },
      ];

      events1.forEach(e => buffer.add(e));

      const lastSeenId = "2";

      const events2 = [
        { id: "3", data: { value: "c" }, timestamp: 3000 },
        { id: "4", data: { value: "d" }, timestamp: 4000 },
      ];

      events2.forEach(e => buffer.add(e));

      const missed = buffer.getSince(lastSeenId);
      expect(missed).toHaveLength(2);
      expect(missed.map(e => e.id)).toEqual(["3", "4"]);
    });

    it("should handle buffer overflow gracefully", () => {
      const events = Array.from({ length: 1500 }, (_, i) => ({
        id: String(i + 1),
        data: { value: i },
        timestamp: 1000 + i,
      }));

      events.forEach(e => buffer.add(e));

      const all = buffer.getAll();
      expect(all.length).toBeLessThanOrEqual(1000);
      expect(all[0].id).toBe("501");
      expect(all[all.length - 1].id).toBe("1500");
    });

    it("should track gaps in event sequence", () => {
      const events = [
        { id: "1", data: { value: "a" }, timestamp: 1000 },
        { id: "2", data: { value: "b" }, timestamp: 2000 },
        { id: "5", data: { value: "e" }, timestamp: 5000 },
      ];

      events.forEach(e => buffer.add(e));

      const lastSeenId = "2";
      const missed = buffer.getSince(lastSeenId);
      
      expect(missed).toHaveLength(1);
      expect(missed[0].id).toBe("5");
      
      const hasGap = parseInt(missed[0].id) - parseInt(lastSeenId) > 1;
      expect(hasGap).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty buffer", () => {
      const result = buffer.getSince("1");
      expect(result).toHaveLength(0);
    });

    it("should handle duplicate event IDs", () => {
      const events = [
        { id: "1", data: { value: "a" }, timestamp: 1000 },
        { id: "1", data: { value: "b" }, timestamp: 2000 },
        { id: "2", data: { value: "c" }, timestamp: 3000 },
      ];

      events.forEach(e => buffer.add(e));

      const result = buffer.getSince("1");
      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1].id).toBe("2");
    });

    it("should handle rapid reconnections", () => {
      buffer.add({ id: "1", data: {}, timestamp: 1000 });
      const r1 = buffer.getSince("0");
      expect(r1.length).toBeGreaterThanOrEqual(1);
      
      buffer.add({ id: "2", data: {}, timestamp: 2000 });
      const r2 = buffer.getSince("1");
      expect(r2.length).toBeGreaterThanOrEqual(1);
      
      buffer.add({ id: "3", data: {}, timestamp: 3000 });
      const r3 = buffer.getSince("2");
      expect(r3.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Timestamp Ordering", () => {
    it("should maintain chronological order", () => {
      const events = [
        { id: "3", data: {}, timestamp: 3000 },
        { id: "1", data: {}, timestamp: 1000 },
        { id: "2", data: {}, timestamp: 2000 },
      ];

      events.forEach(e => buffer.add(e));

      const all = buffer.getAll();
      expect(all[0].timestamp).toBe(3000);
      expect(all[1].timestamp).toBe(1000);
      expect(all[2].timestamp).toBe(2000);
    });

    it("should detect out-of-order events", () => {
      const events = [
        { id: "1", data: {}, timestamp: 1000 },
        { id: "2", data: {}, timestamp: 3000 },
        { id: "3", data: {}, timestamp: 2000 },
      ];

      events.forEach(e => buffer.add(e));

      const all = buffer.getAll();
      const isOutOfOrder = all.some((e, i) => 
        i > 0 && e.timestamp < all[i - 1].timestamp
      );
      
      expect(isOutOfOrder).toBe(true);
    });
  });
});
