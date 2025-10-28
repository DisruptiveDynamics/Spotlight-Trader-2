/**
 * Simple time/date utilities for voice assistant
 * Allows basic time queries without tool calls
 */

export function getCurrentIsoTime(): string {
  return new Date().toISOString();
}

export function getCurrentTimeInfo() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    timestamp: now.getTime(),
    date: now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    time: now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZoneName: 'short'
    }),
  };
}
