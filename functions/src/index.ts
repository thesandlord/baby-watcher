import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { Image } from '@boundaryml/baml';
import { b } from './baml_client/index.js';
import { Confidence, type BusySlot, type CalendarExtraction, type DayAvailability } from './baml_client/types.js';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 20 });

const googleApiKey = defineSecret('GOOGLE_API_KEY');

interface ExtractCalendarRequest {
  imageBase64?: string;
  mimeType?: string;
  hintedDate?: string;
  weekDates?: string[];
}

export interface NormalizedBusySlot {
  start: string;
  end: string;
  title?: string;
}

export interface NormalizedDayAvailability {
  date: string;
  busySlots: NormalizedBusySlot[];
  confidence: 'high' | 'medium' | 'low';
}

export interface NormalizedCalendarExtraction {
  isWeekView: boolean;
  date: string | null;
  weekStart?: string | null;
  busySlots: NormalizedBusySlot[];
  days?: NormalizedDayAvailability[];
  needsDateConfirmation: boolean;
  confidence: 'high' | 'medium' | 'low';
}


function mapConfidence(value: Confidence | undefined | null, fallback: 'high' | 'medium' | 'low'): 'high' | 'medium' | 'low' {
  switch (value) {
    case Confidence.High:
      return 'high';
    case Confidence.Medium:
      return 'medium';
    case Confidence.Low:
      return 'low';
    default:
      return fallback;
  }
}

function parseWallClockTime(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const nextHours = Math.floor(total / 60);
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

function normalizeBusySlots(slots: BusySlot[]): NormalizedBusySlot[] {
  const normalized: NormalizedBusySlot[] = [];

  for (const slot of slots) {
    const start = parseWallClockTime(slot.start);
    if (!start) {
      continue;
    }

    let end = parseWallClockTime(slot.end);
    const durationMinutes =
      typeof slot.durationMinutes === 'number' && slot.durationMinutes > 0
        ? slot.durationMinutes
        : null;

    if (durationMinutes && (!end || end <= start)) {
      end = addMinutesToTime(start, durationMinutes);
    }

    if (!end || start >= end) {
      continue;
    }

    const title = typeof slot.title === 'string' ? slot.title.trim() : '';
    normalized.push(title.length > 0 ? { start, end, title } : { start, end });
  }

  return normalized.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function normalizeDayExtractions(days: DayAvailability[]): NormalizedDayAvailability[] {
  return days
    .filter((day) => typeof day.date === 'string' && day.date.length > 0)
    .map((day) => ({
      date: day.date,
      busySlots: normalizeBusySlots(day.busySlots ?? []),
      confidence: mapConfidence(day.confidence, 'medium'),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeExtraction(parsed: CalendarExtraction): NormalizedCalendarExtraction {
  if (parsed.isWeekView) {
    const days = normalizeDayExtractions(parsed.days ?? []);
    const weekStart =
      typeof parsed.weekStart === 'string' && parsed.weekStart.length > 0
        ? parsed.weekStart
        : days[0]?.date ?? null;
    const needsDateConfirmation = parsed.needsDateConfirmation ?? weekStart === null;

    return {
      isWeekView: true,
      weekStart,
      days,
      needsDateConfirmation,
      date: null,
      busySlots: [],
      confidence: mapConfidence(parsed.confidence, days.length > 0 ? 'medium' : 'low'),
    };
  }

  const busySlots = normalizeBusySlots(parsed.busySlots ?? []);
  const date = typeof parsed.date === 'string' && parsed.date.length > 0 ? parsed.date : null;
  const needsDateConfirmation = parsed.needsDateConfirmation ?? date === null;

  return {
    isWeekView: false,
    date,
    busySlots,
    needsDateConfirmation,
    confidence: mapConfidence(parsed.confidence, date ? 'medium' : 'low'),
  };
}

function buildHints(options: { hintedDate?: string; weekDates?: string[] }): string {
  const hints = ['All extracted times must be Pacific Time (America/Los_Angeles).'];
  if (options.hintedDate) {
    hints.push(`The user indicated this calendar is for ${options.hintedDate}.`);
  }
  if (options.weekDates?.length) {
    hints.push(
      `The app week view covers these weekdays: ${options.weekDates.join(', ')}. If this is a week screenshot, map days to these dates when they match.`
    );
  }
  return hints.join('\n');
}

export const extractCalendar = onCall(
  {
    // Cloud Run must allow unauthenticated *network* invoke so browsers can
    // complete CORS preflight. That is NOT the same as allowing anonymous app
    // users: request.auth below still requires a signed-in Firebase user.
    // Deploy also runs scripts/ensure-extract-calendar-invoker.sh because Gen2
    // updates do not always apply this IAM binding.
    invoker: 'public',
    secrets: [googleApiKey],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request): Promise<NormalizedCalendarExtraction> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required to extract calendar images.');
    }

    const data = (request.data ?? {}) as ExtractCalendarRequest;
    const imageBase64 = typeof data.imageBase64 === 'string' ? data.imageBase64.trim() : '';
    const mimeType =
      typeof data.mimeType === 'string' && data.mimeType.length > 0
        ? data.mimeType
        : 'image/jpeg';

    if (!imageBase64) {
      throw new HttpsError('invalid-argument', 'imageBase64 is required.');
    }

    if (!mimeType.startsWith('image/')) {
      throw new HttpsError('invalid-argument', 'mimeType must be an image/* type.');
    }

    const weekDates = Array.isArray(data.weekDates)
      ? data.weekDates.filter((value): value is string => typeof value === 'string')
      : undefined;

    try {
      const extraction = await b.ExtractCalendar(
        Image.fromBase64(mimeType, imageBase64),
        buildHints({
          hintedDate: typeof data.hintedDate === 'string' ? data.hintedDate : undefined,
          weekDates,
        })
      );
      return normalizeExtraction(extraction);
    } catch (error) {
      console.error('extractCalendar failed', error);
      const message = error instanceof Error ? error.message : 'Calendar extraction failed.';
      throw new HttpsError('internal', message);
    }
  }
);
