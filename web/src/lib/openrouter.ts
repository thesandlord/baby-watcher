import type {
  CalendarExtractionResult,
  BusySlot,
  DayAvailabilityExtraction,
} from '@baby-watcher/shared';
import { APP_TIMEZONE, parseWallClockTime, todayIsoDateInAppTimezone } from './timezone';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** OpenRouter free router: picks an available free model that supports the request (including vision). */
const FREE_VISION_MODEL = 'openrouter/free';

const EXTRACTION_PROMPT = `You extract calendar availability from a screenshot for baby-watching schedule planning.

Return ONLY valid JSON.

For a SINGLE-DAY calendar view, use this shape:
{
  "isWeekView": false,
  "date": "YYYY-MM-DD or null if unclear",
  "busySlots": [
    { "start": "HH:mm", "end": "HH:mm", "title": "optional event name" }
  ],
  "needsDateConfirmation": true/false,
  "confidence": "high" | "medium" | "low"
}

For a WEEK view (multiple days visible in one screenshot), use this shape:
{
  "isWeekView": true,
  "weekStart": "YYYY-MM-DD (Monday of the week shown) or null if unclear",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "busySlots": [
        { "start": "HH:mm", "end": "HH:mm", "title": "optional event name" }
      ],
      "confidence": "high" | "medium" | "low"
    }
  ],
  "needsDateConfirmation": true/false,
  "confidence": "high" | "medium" | "low"
}

Rules:
- All times are Pacific Time (America/Los_Angeles, PST/PDT). Read times exactly as shown on the calendar.
- Use 24-hour time in HH:mm format (e.g. "09:00", "13:30").
- Include meetings, appointments, and blocked time as busy slots.
- Ignore all-day events unless they explicitly block daytime availability.
- For week views, extract busy slots separately for each visible weekday (Mon–Fri when possible).
- If the calendar day or week is unclear, set date/weekStart to null and needsDateConfirmation to true.
- Only include events that overlap 08:00-17:00 Pacific Time when possible.
- Align each event's start and end to the time grid lines shown in the screenshot — do not round to the nearest half hour.
- If no busy slots are visible for a day, include that day with an empty busySlots array.
- Prefer isWeekView true when the screenshot clearly shows multiple days at once.`;

interface OpenRouterMessage {
  role: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

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

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY is not configured');
  }

  const hints: string[] = [
    `All extracted times must be Pacific Time (${APP_TIMEZONE}).`,
  ];
  if (options?.hintedDate) {
    hints.push(`The user indicated this calendar is for ${options.hintedDate}.`);
  }
  if (options?.weekDates?.length) {
    hints.push(
      `The app week view covers these weekdays: ${options.weekDates.join(', ')}. If this is a week screenshot, map days to these dates when they match.`
    );
  }

  const messages: OpenRouterMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: EXTRACTION_PROMPT + (hints.length ? `\n\n${hints.join('\n')}` : ''),
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    },
  ];

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://baby-watcher.app',
      'X-Title': 'Baby Watcher',
    },
    body: JSON.stringify({
      model: FREE_VISION_MODEL,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned an empty response');
  }

  return parseExtractionResult(content);
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
              { start: '09:00', end: '11:00', title: 'Team meetings' },
              { start: '13:00', end: '14:30', title: 'Focus block' },
            ]
          : [{ start: '10:30', end: '12:00', title: 'Client call' }],
        confidence: 'high' as const,
      })),
      needsDateConfirmation: false,
      date: null,
      busySlots: [],
      confidence: 'high',
    };
  }

  const today = todayIsoDateInAppTimezone();
  const date =
    options?.hintedDate ?? today;

  return {
    isWeekView: false,
    date,
    busySlots: [
      { start: '09:00', end: '11:00', title: 'Team meetings' },
      { start: '13:00', end: '14:30', title: 'Focus block' },
    ],
    needsDateConfirmation: false,
    confidence: 'high',
  };
}

function parseExtractionResult(raw: string): CalendarExtractionResult {
  const parsed = JSON.parse(extractJson(raw)) as Partial<CalendarExtractionResult> & {
    days?: Array<Partial<DayAvailabilityExtraction>>;
  };

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
      confidence: parsed.confidence ?? (days.length > 0 ? 'medium' : 'low'),
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
    confidence: parsed.confidence ?? (date ? 'medium' : 'low'),
  };
}

function normalizeDayExtractions(days: Array<Partial<DayAvailabilityExtraction>>): DayAvailabilityExtraction[] {
  return days
    .filter((day): day is Partial<DayAvailabilityExtraction> & { date: string } =>
      typeof day.date === 'string' && day.date.length > 0
    )
    .map((day) => ({
      date: day.date,
      busySlots: normalizeBusySlots(day.busySlots ?? []),
      confidence: day.confidence ?? 'medium',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return raw.trim();
}

function normalizeBusySlots(slots: BusySlot[]): BusySlot[] {
  const normalized: BusySlot[] = [];

  for (const slot of slots) {
    const start = parseWallClockTime(slot.start);
    const end = parseWallClockTime(slot.end);
    if (!start || !end || start >= end) {
      continue;
    }
    normalized.push({
      start,
      end,
      title: slot.title,
    });
  }

  return normalized.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}
