import { toZonedTime } from 'date-fns-tz';

const ET = 'America/New_York';

interface MarketHours {
  isOpen: boolean;
  isPreMarket: boolean;
  isAfterHours: boolean;
  nextOpenTime?: Date;
  nextCloseTime?: Date;
}

export function getMarketHours(timestamp: number = Date.now()): MarketHours {
  const etDate = toZonedTime(new Date(timestamp), ET);
  const dayOfWeek = etDate.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = etDate.getHours();
  const minute = etDate.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Market hours in ET
  const preMarketStart = 4 * 60; // 4:00 AM
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  const afterHoursEnd = 20 * 60; // 8:00 PM

  // Weekend check
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) {
    return {
      isOpen: false,
      isPreMarket: false,
      isAfterHours: false,
    };
  }

  // Regular trading hours (9:30 AM - 4:00 PM ET)
  const isOpen = timeInMinutes >= marketOpen && timeInMinutes < marketClose;
  
  // Pre-market (4:00 AM - 9:30 AM ET)
  const isPreMarket = timeInMinutes >= preMarketStart && timeInMinutes < marketOpen;
  
  // After hours (4:00 PM - 8:00 PM ET)
  const isAfterHours = timeInMinutes >= marketClose && timeInMinutes < afterHoursEnd;

  return {
    isOpen,
    isPreMarket,
    isAfterHours,
  };
}

export function isMarketOpen(timestamp: number = Date.now()): boolean {
  return getMarketHours(timestamp).isOpen;
}
