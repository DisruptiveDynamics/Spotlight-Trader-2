/**
 * Session time utilities for detecting Regular Trading Hours (RTH)
 * 
 * RTH = 9:30 AM - 4:00 PM ET, Monday-Friday
 * Extended hours = all other times within 4 AM - 8 PM ET
 * 
 * Note: Uses Intl.DateTimeFormat for cross-platform browser/Node compatibility
 */

const ET_TIMEZONE = "America/New_York";

/**
 * Check if a timestamp falls within Regular Trading Hours
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns true if during RTH (9:30 AM - 4:00 PM ET, Mon-Fri), false otherwise
 */
export function isRegularTradingHours(timestamp: number): boolean {
  const date = new Date(timestamp);
  
  // Use Intl.DateTimeFormat to get ET components reliably
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  });
  
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  
  // Weekend check (Saturday = "Sat", Sunday = "Sun")
  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }
  
  const timeInMinutes = hour * 60 + minute;
  
  // RTH: 9:30 AM (570 minutes) to 4:00 PM (960 minutes)
  const marketOpen = 9 * 60 + 30; // 9:30 AM = 570 minutes
  const marketClose = 16 * 60; // 4:00 PM = 960 minutes
  
  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

/**
 * Get volume bar color with session-aware opacity
 * 
 * @param close - Close price
 * @param open - Open price
 * @param timestamp - Bar start timestamp in milliseconds
 * @returns RGBA color string with opacity based on session
 */
export function getVolumeColor(close: number, open: number, timestamp: number): string {
  const isRTH = isRegularTradingHours(timestamp);
  const opacity = isRTH ? 1.0 : 0.3; // Full opacity during RTH, 30% during extended hours

  // Green for up bars, red for down bars
  if (close >= open) {
    return `rgba(22, 163, 74, ${opacity})`; // #16A34A with opacity
  } else {
    return `rgba(220, 38, 38, ${opacity})`; // #DC2626 with opacity
  }
}
