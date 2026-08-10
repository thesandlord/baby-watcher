import type { DaySchedule } from '@baby-watcher/shared';

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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mondayOfWeek(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  const day = parsed.getDay();
  parsed.setDate(parsed.getDate() - (day === 0 ? 6 : day - 1));
  return isoDate(parsed);
}

export function weekdayDates(weekStart: string): string[] {
  const monday = new Date(`${mondayOfWeek(weekStart)}T12:00:00`);
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return isoDate(date);
  });
}

export function shiftWeek(weekStart: string, weeks: number): string {
  const date = new Date(`${mondayOfWeek(weekStart)}T12:00:00`);
  date.setDate(date.getDate() + weeks * 7);
  return isoDate(date);
}

export function formatWeekRange(dates: string[]): string {
  if (dates.length === 0) {
    return '';
  }
  const start = new Date(`${dates[0]}T12:00:00`);
  const finish = new Date(`${dates.at(-1)}T12:00:00`);
  finish.setDate(finish.getDate() + 1);
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const finishLabel = finish.toLocaleDateString(undefined, {
    month: start.getMonth() === finish.getMonth() ? undefined : 'short',
    day: 'numeric',
  });
  return `${startLabel}-${finishLabel}`;
}

export function formatDisplayDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function formatSlotTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

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
