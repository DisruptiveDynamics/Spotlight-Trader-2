export type SessionType = "premarket" | "rth" | "after" | "closed";

export interface SessionStatus {
  open: boolean;
  session: SessionType;
}

export function isRthOpen(nowUtc: number = Date.now()): SessionStatus {
  const date = new Date(nowUtc);

  // Convert to US/Eastern timezone
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));

  const dayOfWeek = etDate.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Market closed on weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { open: false, session: "closed" };
  }

  // RTH: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM

  // Premarket: 4:00 AM - 9:30 AM ET
  const premarketStart = 4 * 60; // 4:00 AM

  // After-hours: 4:00 PM - 8:00 PM ET
  const afterHoursEnd = 20 * 60; // 8:00 PM

  if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
    return { open: true, session: "rth" };
  }

  if (timeInMinutes >= premarketStart && timeInMinutes < marketOpen) {
    return { open: true, session: "premarket" }; // Market data available in premarket
  }

  if (timeInMinutes >= marketClose && timeInMinutes < afterHoursEnd) {
    return { open: true, session: "after" }; // Market data available after hours
  }

  return { open: false, session: "closed" };
}
