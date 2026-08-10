import type { BusySlot, PersonAvailability, ScheduleSlot } from './types.js';

export const WORKDAY_START = '08:00';
export const WORKDAY_END = '17:00';
export const SLOT_MINUTES = 15;

export function generateTimeSlots(
  start: string,
  end: string,
  intervalMinutes: number
): Array<{ start: string; end: string }> {
  const slots: Array<{ start: string; end: string }> = [];
  let current = parseTime(start);
  const endMinutes = parseTime(end);

  while (current < endMinutes) {
    const slotEnd = Math.min(current + intervalMinutes, endMinutes);
    slots.push({
      start: formatTime(current),
      end: formatTime(slotEnd),
    });
    current = slotEnd;
  }

  return slots;
}

export function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isBusyDuringSlot(
  busySlots: BusySlot[],
  slotStart: string,
  slotEnd: string
): boolean {
  const slotStartMin = parseTime(slotStart);
  const slotEndMin = parseTime(slotEnd);

  return busySlots.some((busy) => {
    const busyStart = parseTime(busy.start);
    const busyEnd = parseTime(busy.end);
    return busyStart < slotEndMin && busyEnd > slotStartMin;
  });
}

export function hashScheduleInput(
  date: string,
  people: PersonAvailability[],
  watcherIds: string[]
): string {
  const normalized = {
    date,
    watcherIds: [...watcherIds].sort(),
    people: [...people]
      .sort((a, b) => a.userId.localeCompare(b.userId))
      .map((person) => ({
        userId: person.userId,
        displayName: person.displayName,
        busySlots: [...person.busySlots]
          .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
          .map((slot) => ({
            start: slot.start,
            end: slot.end,
            title: slot.title ?? '',
          })),
      })),
  };

  return stableStringify(normalized);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Deterministic baby-watching schedule generator.
 * Assigns each 15-minute slot to the available watcher with the fewest
 * prior assignments; ties break on userId lexicographic order.
 */
export function generateSchedule(
  date: string,
  people: PersonAvailability[],
  watcherIds: string[]
): ScheduleSlot[] {
  const slots = generateTimeSlots(WORKDAY_START, WORKDAY_END, SLOT_MINUTES);
  const assignmentCounts = Object.fromEntries(
    watcherIds.map((id) => [id, 0])
  ) as Record<string, number>;

  const peopleById = new Map(people.map((person) => [person.userId, person]));

  return slots.map((slot) => {
    const available = watcherIds.filter((userId) => {
      const person = peopleById.get(userId);
      if (!person) {
        return false;
      }
      return !isBusyDuringSlot(person.busySlots, slot.start, slot.end);
    });

    if (available.length === 0) {
      return {
        start: slot.start,
        end: slot.end,
        watcherId: null,
        watcherName: 'Unassigned',
      };
    }

    available.sort((a, b) => {
      const countDiff = assignmentCounts[a] - assignmentCounts[b];
      if (countDiff !== 0) {
        return countDiff;
      }
      return a.localeCompare(b);
    });

    const assignedId = available[0];
    assignmentCounts[assignedId] += 1;
    const assignedPerson = peopleById.get(assignedId);

    return {
      start: slot.start,
      end: slot.end,
      watcherId: assignedId,
      watcherName: assignedPerson?.displayName ?? assignedId,
    };
  });
}
