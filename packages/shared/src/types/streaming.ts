/**
 * Type-safe streaming and real-time data structures
 */

export interface SSEEvent<T = unknown> {
  event: string;
  data: T;
  id?: string;
  retry?: number;
}

export interface TradingAlert {
  id: string;
  symbol: string;
  type: 'entry' | 'exit' | 'stop' | 'target' | 'risk';
  message: string;
  timestamp: number;
  urgency: 'low' | 'medium' | 'high';
  data?: Record<string, unknown>;
}

export interface MicroBar {
  symbol: string;
  timestamp: number;
  price: number;
  size: number;
  vwap?: number;
}

export type SSEEventHandler<T> = (data: T) => void;

export interface SSEListener<T = unknown> {
  event: string;
  handler: SSEEventHandler<T>;
}
