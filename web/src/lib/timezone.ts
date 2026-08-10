/** All calendar dates and wall-clock times in the app use Pacific Time. */
export const APP_TIMEZONE = 'America/Los_Angeles';

const calendarDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE });

export function todayIsoDateInAppTimezone(now = new Date()): string {
  return calendarDateFormatter.format(now);
}

export function formatCalendarDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions
): string {
  const instant = utcInstantForPacificCalendarDate(isoDate, 12);
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: APP_TIMEZONE }).format(instant);
}

export function weekdayIndexInAppTimezone(isoDate: string): number {
  const instant = utcInstantForPacificCalendarDate(isoDate, 12);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
  }).format(instant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function shiftCalendarDate(isoDate: string, days: number): string {
  const instant = utcInstantForPacificCalendarDate(isoDate, 12);
  instant.setUTCDate(instant.getUTCDate() + days);
  return calendarDateFormatter.format(instant);
}

export function nowMinutesInAppTimezone(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const second = Number(parts.find((part) => part.type === 'second')?.value ?? 0);
  return hour * 60 + minute + second / 60;
}

/** Formats a Pacific wall-clock HH:mm string for display (no timezone conversion). */
export function formatWallClockTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function parseWallClockTime(raw: string): string | null {
  const trimmed = raw.trim();

  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    const hours = Number(match24[1]);
    const minutes = Number(match24[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = Number(match12[1]);
    const minutes = Number(match12[2]);
    const period = match12[3].toUpperCase();
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return null;
    }
    if (period === 'AM') {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return null;
}

function utcInstantForPacificCalendarDate(isoDate: string, hour: number, minute = 0): Date {
  const [year, month, day] = isoDate.split('-').map(Number);

  for (const offsetHours of [8, 7]) {
    const instant = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute, 0));
    if (calendarDateFormatter.format(instant) === isoDate) {
      return instant;
    }
  }

  return new Date(Date.UTC(year, month - 1, day, hour + 8, minute, 0));
}
