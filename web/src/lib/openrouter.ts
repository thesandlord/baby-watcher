import type { CalendarExtractionResult, BusySlot } from '@baby-watcher/shared';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_VISION_MODEL = 'google/gemma-3-27b-it:free';

const EXTRACTION_PROMPT = `You extract calendar availability from a screenshot for baby-watching schedule planning.

Return ONLY valid JSON with this exact shape:
{
  "date": "YYYY-MM-DD or null if unclear",
  "busySlots": [
    { "start": "HH:mm", "end": "HH:mm", "title": "optional event name" }
  ],
  "needsDateConfirmation": true/false,
  "confidence": "high" | "medium" | "low"
}

Rules:
- Use 24-hour time in HH:mm format.
- Include meetings, appointments, and blocked time as busy slots.
- Ignore all-day events unless they explicitly block daytime availability.
- If the calendar day is unclear, set date to null and needsDateConfirmation to true.
- Only include events that overlap 08:00-17:00 local time when possible.
- If no busy slots are visible, return an empty busySlots array.`;

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
  hintedDate?: string
): Promise<CalendarExtractionResult> {
  if (import.meta.env.VITE_MOCK_CALENDAR_EXTRACTION === 'true') {
    return mockCalendarExtraction(hintedDate);
  }

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY is not configured');
  }

  const dateHint = hintedDate
    ? `\nThe user indicated this calendar is for ${hintedDate}.`
    : '';

  const messages: OpenRouterMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: EXTRACTION_PROMPT + dateHint },
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
      model: import.meta.env.VITE_OPENROUTER_VISION_MODEL ?? DEFAULT_VISION_MODEL,
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

function mockCalendarExtraction(hintedDate?: string): CalendarExtractionResult {
  const today = new Date();
  const date =
    hintedDate ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return {
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
  const parsed = JSON.parse(extractJson(raw)) as Partial<CalendarExtractionResult>;

  const busySlots = normalizeBusySlots(parsed.busySlots ?? []);
  const date = typeof parsed.date === 'string' && parsed.date.length > 0 ? parsed.date : null;
  const needsDateConfirmation = parsed.needsDateConfirmation ?? date === null;

  return {
    date,
    busySlots,
    needsDateConfirmation,
    confidence: parsed.confidence ?? (date ? 'medium' : 'low'),
  };
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return raw.trim();
}

function normalizeBusySlots(slots: BusySlot[]): BusySlot[] {
  return slots
    .filter((slot) => slot.start && slot.end)
    .map((slot) => ({
      start: slot.start.slice(0, 5),
      end: slot.end.slice(0, 5),
      title: slot.title,
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}
