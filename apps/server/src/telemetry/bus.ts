import { EventEmitter } from 'events';
import type { TelemetryEvent, TelemetrySubscription } from './types';

class TelemetryBus extends EventEmitter {
  private subscriptions = new Map<string, TelemetrySubscription[]>();

  subscribe(symbol: string, timeframe: string, handler: (event: TelemetryEvent) => void): string {
    const key = `${symbol}:${timeframe}`;
    const subscription: TelemetrySubscription = { symbol, timeframe, handler };
    
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, []);
    }
    
    this.subscriptions.get(key)!.push(subscription);
    
    return key;
  }

  unsubscribe(subscriptionKey: string, handler: (event: TelemetryEvent) => void): void {
    const subs = this.subscriptions.get(subscriptionKey);
    if (subs) {
      const filtered = subs.filter((s) => s.handler !== handler);
      if (filtered.length > 0) {
        this.subscriptions.set(subscriptionKey, filtered);
      } else {
        this.subscriptions.delete(subscriptionKey);
      }
    }
  }

  publish(event: TelemetryEvent): void {
    const key = `${event.symbol}:${event.timeframe}`;
    const subs = this.subscriptions.get(key);
    
    if (subs) {
      subs.forEach((sub) => {
        try {
          sub.handler(event);
        } catch (error) {
          console.error(`[TelemetryBus] Error in handler for ${key}:`, error);
        }
      });
    }
    
    this.emit('event', event);
  }

  getSubscriptionCount(): number {
    let count = 0;
    this.subscriptions.forEach((subs) => {
      count += subs.length;
    });
    return count;
  }

  clear(): void {
    this.subscriptions.clear();
    this.removeAllListeners();
  }
}

export const telemetryBus = new TelemetryBus();
