import type {
  CalendarExtractionResult,
  BusySlot,
} from '@baby-watcher/shared';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { todayIsoDateInAppTimezone } from './timezone';

export async function extractCalendarFromImage(
  imageBase64: string,
  mimeType: string,
  options?: {
    hintedDate?: string;
    weekDates?: string[];
  }
): Promise<CalendarExtractionResult> {
  if (import.meta.env.VITE_MOCK_CALENDAR_EXTRACTION === 'true') {
    return mockCalendarExtraction(options);
  }

  const callable = httpsCallable<
    {
      imageBase64: string;
      mimeType: string;
      hintedDate?: string;
      weekDates?: string[];
    },
    CalendarExtractionResult
  >(functions, 'extractCalendar');

  try {
    const response = await callable({
      imageBase64,
      mimeType,
      hintedDate: options?.hintedDate,
      weekDates: options?.weekDates,
    });
    return normalizeClientResult(response.data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Calendar extraction request failed.';
    throw new Error(message.replace(/^FirebaseError:\s*/i, ''));
  }
}

function normalizeClientResult(data: CalendarExtractionResult): CalendarExtractionResult {
  if (data.isWeekView) {
    return {
      isWeekView: true,
      weekStart: data.weekStart ?? null,
      days: (data.days ?? []).map((day) => ({
        date: day.date,
        busySlots: normalizeClientBusySlots(day.busySlots ?? []),
        confidence: day.confidence,
      })),
      needsDateConfirmation: Boolean(data.needsDateConfirmation),
      date: null,
      busySlots: [],
      confidence: data.confidence,
    };
  }

  return {
    isWeekView: false,
    date: data.date ?? null,
    busySlots: normalizeClientBusySlots(data.busySlots ?? []),
    needsDateConfirmation: Boolean(data.needsDateConfirmation),
    confidence: data.confidence,
  };
}

function normalizeClientBusySlots(slots: BusySlot[]): BusySlot[] {
  return slots.map((slot) => {
    const title = slot.title?.trim();
    return title ? { start: slot.start, end: slot.end, title } : { start: slot.start, end: slot.end };
  });
}

function mockCalendarExtraction(options?: {
  hintedDate?: string;
  weekDates?: string[];
}): CalendarExtractionResult {
  if (options?.weekDates?.length) {
    return {
      isWeekView: true,
      weekStart: options.weekDates[0] ?? null,
      days: options.weekDates.map((date, index) => ({
        date,
        busySlots: index % 2 === 0
          ? [
              { start: '09:00', end: '09:30', title: 'Standup' },
              { start: '10:00', end: '11:00', title: 'Team meetings' },
              { start: '13:00', end: '14:30', title: 'Focus block' },
            ]
          : [{ start: '10:30', end: '11:00', title: 'Client call' }],
        confidence: 'high' as const,
      })),
      needsDateConfirmation: false,
      date: null,
      busySlots: [],
      confidence: 'high',
    };
  }

  const date = options?.hintedDate ?? todayIsoDateInAppTimezone();

  return {
    isWeekView: false,
    date,
    busySlots: [
      { start: '09:00', end: '09:30', title: 'Standup' },
      { start: '10:00', end: '11:00', title: 'Team meetings' },
      { start: '13:00', end: '14:30', title: 'Focus block' },
    ],
    needsDateConfirmation: false,
    confidence: 'high',
  };
}
