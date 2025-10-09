import { useState, useCallback } from 'react';
import type { InsightContext, InsightResponse } from '@spotlight/shared';

interface UseExplainSignalResult {
  explain: (question: string, context: InsightContext) => Promise<void>;
  response: InsightResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useExplainSignal(): UseExplainSignalResult {
  const [response, setResponse] = useState<InsightResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback(async (question: string, context: InsightContext) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/insight/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context, question }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Rate limit exceeded. Please wait before asking again.');
        }
        throw new Error('Failed to get insight from coach');
      }

      const data: InsightResponse = await res.json();
      setResponse(data);

      // Emit custom event for other components to listen
      window.dispatchEvent(
        new CustomEvent('coach:insight', {
          detail: { question, response: data },
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Explain signal error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    explain,
    response,
    isLoading,
    error,
  };
}
