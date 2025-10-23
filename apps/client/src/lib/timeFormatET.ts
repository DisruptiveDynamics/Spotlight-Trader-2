import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { Time, UTCTimestamp, BusinessDay, TickMarkType } from "lightweight-charts";

/**
 * Eastern Time (America/New_York) timezone constant
 * Automatically handles DST transitions
 */
const ET_TIMEZONE = "America/New_York";

/**
 * Check if a Time value is a BusinessDay
 */
function isBusinessDay(time: Time): time is BusinessDay {
  return typeof time === "object" && "year" in time && "month" in time && "day" in time;
}

/**
 * Format time for x-axis tick marks in Eastern Time (12-hour format)
 * Used by: chart.applyOptions({ timeScale: { tickMarkFormatter: formatTickET } })
 * 
 * @param time - UTCTimestamp (seconds since epoch) or BusinessDay
 * @param tickMarkType - Type of tick mark (Year, Month, DayOfMonth, Time, TimeWithSeconds)
 * @returns Formatted string in ET with appropriate granularity (12-hour AM/PM for times)
 */
export function formatTickET(time: Time, tickMarkType: TickMarkType): string {
  let date: Date;
  
  if (isBusinessDay(time)) {
    // BusinessDay format: { year: 2025, month: 10, day: 22 }
    // Note: months are 1-indexed in BusinessDay
    date = new Date(time.year, time.month - 1, time.day);
  } else {
    // UTCTimestamp: seconds since epoch
    date = new Date((time as UTCTimestamp) * 1000);
  }
  
  // Format based on tick mark type (use 12-hour format for readability)
  switch (tickMarkType) {
    case 0: // Year
      return formatInTimeZone(date, ET_TIMEZONE, "yyyy");
    case 1: // Month
      return formatInTimeZone(date, ET_TIMEZONE, "MMM ''yy");
    case 2: // DayOfMonth
      return formatInTimeZone(date, ET_TIMEZONE, "MMM d");
    case 3: // Time (no seconds) - 12-hour format
      return formatInTimeZone(date, ET_TIMEZONE, "h:mm a");
    case 4: // TimeWithSeconds - 12-hour format
      return formatInTimeZone(date, ET_TIMEZONE, "h:mm:ss a");
    default:
      return formatInTimeZone(date, ET_TIMEZONE, "MMM d h:mm a");
  }
}

/**
 * Format time for crosshair/tooltip display in Eastern Time (12-hour format)
 * Used by: chart.applyOptions({ localization: { timeFormatter: formatTooltipET } })
 * 
 * @param unixSeconds - Unix timestamp in seconds
 * @returns Formatted string showing full date and time in ET (12-hour AM/PM)
 */
export function formatTooltipET(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  
  // Full format with 12-hour time and timezone indicator for tooltips
  // Example: "Oct 22, 2025 7:30 PM ET"
  return formatInTimeZone(date, ET_TIMEZONE, "MMM d, yyyy h:mm a") + " ET";
}

/**
 * Format UNIX seconds timestamp for labels in ET (12-hour format with DST)
 * Use for crosshair/tooltip and simple tick labels on intraday charts
 */
export function formatUnixSecondsToET(unixSeconds: number, showSeconds = false): string {
  const fmt = showSeconds ? "h:mm:ss a" : "h:mm a";
  return formatInTimeZone(unixSeconds * 1000, ET_TIMEZONE, fmt);
}

/**
 * Tick-mark formatter for lightweight-charts logical/time scale
 * Receives UNIX seconds for time-based scales on intraday charts
 */
export function tickMarkFormatterET(unixSeconds: number): string {
  // Keep ticks concise (no seconds), 12-hour format
  return formatUnixSecondsToET(unixSeconds, false);
}

/**
 * Optional: day boundary labels (useful when scrolling far back)
 */
export function dayBoundaryLabelET(unixSeconds: number): string {
  return formatInTimeZone(unixSeconds * 1000, ET_TIMEZONE, "MMM d h:mm a");
}
