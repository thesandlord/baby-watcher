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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
