enum Confidence {
  High @alias("high")
  Medium @alias("medium")
  Low @alias("low")
}

class BusySlot {
  start string @description("Event start in HH:mm 24-hour Pacific Time")
  end string @description("Event end in HH:mm 24-hour Pacific Time")
  title string? @description("Optional event name if visible on the calendar")
  durationMinutes int? @description("Duration in minutes when end time is unclear but length is visible")
}

class DayAvailability {
  date string @description("YYYY-MM-DD for this weekday")
  busySlots BusySlot[]
  confidence Confidence
}

class CalendarExtraction {
  isWeekView bool @description("True when the screenshot shows multiple days at once")
  date string? @description("YYYY-MM-DD for single-day views; null if unclear")
  weekStart string? @description("Monday YYYY-MM-DD for week views; null if unclear")
  busySlots BusySlot[] @description("Busy slots for single-day views; empty array for week views")
  days DayAvailability[] @description("Per-day extractions for week views; empty for single-day")
  needsDateConfirmation bool @description("True when the calendar day/week is unclear")
  confidence Confidence
}

function ExtractCalendar(img: image, hints: string) -> CalendarExtraction {
  client GeminiFlash
  prompt #"
    {{ _.role("user") }}
    You extract calendar availability from a screenshot for baby-watching schedule planning.

    Rules:
    - All times are Pacific Time (America/Los_Angeles, PST/PDT). Read times exactly as shown.
    - Use 24-hour time in HH:mm format (e.g. "09:00", "13:30").
    - Include meetings, appointments, and blocked time as busy slots.
    - Ignore all-day events unless they explicitly block daytime availability.
    - For week views, extract busy slots separately for each visible weekday (Mon–Fri when possible).
    - If the calendar day or week is unclear, set date/weekStart to null and needsDateConfirmation to true.
    - Only include events that overlap 08:00-17:00 Pacific Time when possible.
    - Read each event's exact start AND end from the calendar grid lines. Do NOT assume meetings are 1 hour long.
    - Many meetings are 15, 25, 30, 45, or 50 minutes — use the visible end time, not a default 60-minute block.
    - Examples: a 30-minute meeting at 9:00 must be {"start":"09:00","end":"09:30"}, NOT {"start":"09:00","end":"10:00"}.
    - When end time is unclear but duration is visible, set durationMinutes (e.g. 30) and still provide your best start/end.
    - Snap start and end to 15-minute increments (e.g. :00, :15, :30, :45), but preserve the actual duration shown.
    - If no busy slots are visible for a day, include that day with an empty busySlots array.
    - Prefer isWeekView true when the screenshot clearly shows multiple days at once.
    - Event titles/names are optional — omit title when not visible.

    {{ hints }}

    {{ img }}

    {{ ctx.output_format }}
  "#
}
