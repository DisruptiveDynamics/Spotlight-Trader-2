import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { UTCTimestamp } from 'lightweight-charts';

const ET_TIMEZONE = 'America/New_York';

export function formatTickET(timestamp: UTCTimestamp): string {
  const date = new Date(timestamp * 1000);
  const etDate = toZonedTime(date, ET_TIMEZONE);
  return format(etDate, 'HH:mm');
}

export function formatTooltipET(timestamp: UTCTimestamp): string {
  const date = new Date(timestamp * 1000);
  const etDate = toZonedTime(date, ET_TIMEZONE);
  return format(etDate, 'MMM dd, HH:mm:ss');
}
