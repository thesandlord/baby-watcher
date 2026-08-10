import { describe, expect, it } from 'vitest';
import {
  generateSchedule,
  generateTimeSlots,
  hashScheduleInput,
  isBusyDuringSlot,
} from './schedule.js';
import type { PersonAvailability } from './types.js';

describe('generateTimeSlots', () => {
  it('creates 15-minute slots from 8am to 5pm', () => {
    const slots = generateTimeSlots('08:00', '17:00', 15);
    expect(slots).toHaveLength(36);
    expect(slots[0]).toEqual({ start: '08:00', end: '08:15' });
    expect(slots.at(-1)).toEqual({ start: '16:45', end: '17:00' });
  });
});

describe('isBusyDuringSlot', () => {
  it('detects overlapping busy periods', () => {
    expect(
      isBusyDuringSlot([{ start: '09:00', end: '10:00' }], '09:30', '10:00')
    ).toBe(true);
    expect(
      isBusyDuringSlot([{ start: '09:00', end: '10:00' }], '10:00', '10:30')
    ).toBe(false);
  });
});

describe('generateSchedule', () => {
  const people: PersonAvailability[] = [
    {
      userId: 'alice',
      displayName: 'Alice',
      busySlots: [{ start: '09:00', end: '12:00' }],
    },
    {
      userId: 'bob',
      displayName: 'Bob',
      busySlots: [{ start: '13:00', end: '15:00' }],
    },
  ];

  it('is deterministic for the same input', () => {
    const first = generateSchedule('2026-08-09', people, ['alice', 'bob']);
    const second = generateSchedule('2026-08-09', people, ['alice', 'bob']);
    expect(first).toEqual(second);
  });

  it('assigns available watchers and balances load', () => {
    const schedule = generateSchedule('2026-08-09', people, ['alice', 'bob']);

    const morningSlot = schedule.find((slot) => slot.start === '08:00');
    expect(morningSlot?.watcherId).toBe('alice');

    const aliceBusySlot = schedule.find((slot) => slot.start === '09:30');
    expect(aliceBusySlot?.watcherId).toBe('bob');

    const bobBusySlot = schedule.find((slot) => slot.start === '13:30');
    expect(bobBusySlot?.watcherId).toBe('alice');
  });

  it('marks slots unassigned when everyone is busy', () => {
    const everyoneBusy: PersonAvailability[] = [
      {
        userId: 'alice',
        displayName: 'Alice',
        busySlots: [{ start: '08:00', end: '17:00' }],
      },
      {
        userId: 'bob',
        displayName: 'Bob',
        busySlots: [{ start: '08:00', end: '17:00' }],
      },
    ];

    const schedule = generateSchedule('2026-08-09', everyoneBusy, ['alice', 'bob']);
    expect(schedule.every((slot) => slot.watcherId === null)).toBe(true);
  });
});

describe('hashScheduleInput', () => {
  it('produces stable hashes regardless of input order', () => {
    const peopleA: PersonAvailability[] = [
      { userId: 'bob', displayName: 'Bob', busySlots: [{ start: '10:00', end: '11:00' }] },
      { userId: 'alice', displayName: 'Alice', busySlots: [{ start: '09:00', end: '10:00' }] },
    ];
    const peopleB: PersonAvailability[] = [
      { userId: 'alice', displayName: 'Alice', busySlots: [{ start: '09:00', end: '10:00' }] },
      { userId: 'bob', displayName: 'Bob', busySlots: [{ start: '10:00', end: '11:00' }] },
    ];

    expect(hashScheduleInput('2026-08-09', peopleA, ['bob', 'alice'])).toBe(
      hashScheduleInput('2026-08-09', peopleB, ['alice', 'bob'])
    );
  });
});
