import type { DaySchedule } from '@baby-watcher/shared';
import {
  APP_TIMEZONE,
  formatCalendarDate,
  formatWallClockTime,
  nowMinutesInAppTimezone,
  shiftCalendarDate,
  todayIsoDateInAppTimezone,
  weekdayIndexInAppTimezone,
} from './timezone';

export { APP_TIMEZONE, formatCalendarDate } from './timezone';

export interface HouseholdMember {
  userId: string;
  displayName: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  household: {
    id: string;
    inviteCode: string | null;
    members: HouseholdMember[];
  } | null;
}

export function todayIsoDate(): string {
  const fixedToday = import.meta.env.VITE_FIXED_TODAY;
  if (fixedToday) {
    return fixedToday;
  }
  return todayIsoDateInAppTimezone();
}

export function mondayOfWeek(date: string): string {
  const day = weekdayIndexInAppTimezone(date);
  const daysFromMonday = day === 0 ? 6 : day - 1;
  return shiftCalendarDate(date, -daysFromMonday);
}

export function shiftDate(date: string, days: number): string {
  return shiftCalendarDate(date, days);
}

export function isWeekend(date: string): boolean {
  const day = weekdayIndexInAppTimezone(date);
  return day === 0 || day === 6;
}

export function shiftWeekday(date: string, weekdays: number): string {
  let current = date;
  const direction = weekdays >= 0 ? 1 : -1;
  let remaining = Math.abs(weekdays);

  while (remaining > 0) {
    current = shiftDate(current, direction);
    if (!isWeekend(current)) {
      remaining -= 1;
    }
  }

  return current;
}

export function nextWeekday(date: string): string {
  return shiftWeekday(date, 1);
}

export type ScheduleViewMode = 'day' | 'three-day';

export function viewDatesFor(activeDate: string, mode: ScheduleViewMode): string[] {
  if (mode === 'day') {
    return [activeDate];
  }

  const second = nextWeekday(activeDate);
  const third = nextWeekday(second);
  return [activeDate, second, third];
}

export function formatViewHeading(dates: string[]): string {
  if (dates.length === 1) {
    return '';
  }

  return formatWeekRange(dates);
}

export function formatShortDate(date: string): string {
  return formatCalendarDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weekdayDates(weekStart: string): string[] {
  const monday = mondayOfWeek(weekStart);
  return Array.from({ length: 5 }, (_, index) => shiftCalendarDate(monday, index));
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return shiftCalendarDate(mondayOfWeek(weekStart), weeks * 7);
}

export function formatWeekRange(dates: string[]): string {
  if (dates.length === 0) {
    return '';
  }
  const startLabel = formatCalendarDate(dates[0], { month: 'short', day: 'numeric' });
  const finishLabel = formatCalendarDate(dates.at(-1)!, {
    month: dates[0].slice(0, 7) === dates.at(-1)!.slice(0, 7) ? undefined : 'short',
    day: 'numeric',
  });
  return `${startLabel}-${finishLabel}`;
}

export function formatDisplayDate(date: string): string {
  return formatCalendarDate(date, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function formatSlotTime(time: string): string {
  return formatWallClockTime(time);
}

/** Returns 0–1 position through the workday, or null if outside the range. */
export function currentTimeLineFraction(
  now = new Date(),
  start = '08:00',
  end = '17:00'
): number | null {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const nowMinutes = nowMinutesInAppTimezone(now);

  if (nowMinutes < startMinutes || nowMinutes > endMinutes) {
    return null;
  }

  return (nowMinutes - startMinutes) / (endMinutes - startMinutes);
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function isDaySchedule(value: unknown): value is DaySchedule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'date' in value &&
    'slots' in value
  );
}
