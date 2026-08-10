export type HouseholdRole = 'watcher' | 'viewer';

export interface BusySlot {
  start: string;
  end: string;
  title?: string;
}

export interface PersonAvailability {
  userId: string;
  displayName: string;
  busySlots: BusySlot[];
}

export interface ScheduleSlot {
  start: string;
  end: string;
  watcherId: string | null;
  watcherName: string;
  isManualOverride?: boolean;
}

export interface DayAvailabilityExtraction {
  date: string;
  busySlots: BusySlot[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CalendarExtractionResult {
  date: string | null;
  busySlots: BusySlot[];
  needsDateConfirmation: boolean;
  confidence: 'high' | 'medium' | 'low';
  isWeekView?: boolean;
  weekStart?: string | null;
  days?: DayAvailabilityExtraction[];
}

export interface DaySchedule {
  date: string;
  householdId: string;
  slots: ScheduleSlot[];
  generatedAt: string;
  inputHash: string;
}
