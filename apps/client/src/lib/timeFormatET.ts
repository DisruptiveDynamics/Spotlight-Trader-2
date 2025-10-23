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
 * Format time for x-axis tick marks in Eastern Time
 * Used by: chart.applyOptions({ timeScale: { tickMarkFormatter: formatTickET } })
 * 
 * @param time - UTCTimestamp (seconds since epoch) or BusinessDay
 * @param tickMarkType - Type of tick mark (Year, Month, DayOfMonth, Time, TimeWithSeconds)
 * @returns Formatted string in ET with appropriate granularity
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
  
  // Format based on tick mark type
  switch (tickMarkType) {
    case 0: // Year
      return formatInTimeZone(date, ET_TIMEZONE, "yyyy");
    case 1: // Month
      return formatInTimeZone(date, ET_TIMEZONE, "MMM ''yy");
    case 2: // DayOfMonth
      return formatInTimeZone(date, ET_TIMEZONE, "MMM d");
    case 3: // Time (no seconds)
      return formatInTimeZone(date, ET_TIMEZONE, "HH:mm");
    case 4: // TimeWithSeconds
      return formatInTimeZone(date, ET_TIMEZONE, "HH:mm:ss");
    default:
      return formatInTimeZone(date, ET_TIMEZONE, "MMM d HH:mm");
  }
}

/**
 * Format time for crosshair/tooltip display in Eastern Time
 * Used by: chart.applyOptions({ localization: { timeFormatter: formatTooltipET } })
 * 
 * @param unixSeconds - Unix timestamp in seconds
 * @returns Formatted string showing full date and time in ET
 */
export function formatTooltipET(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  
  // Full format with timezone indicator for tooltips
  // Example: "Oct 22, 2025 16:30 ET"
  return formatInTimeZone(date, ET_TIMEZONE, "MMM d, yyyy HH:mm") + " ET";
}
