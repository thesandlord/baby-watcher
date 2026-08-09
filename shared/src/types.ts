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
}

export interface CalendarExtractionResult {
  date: string | null;
  busySlots: BusySlot[];
  needsDateConfirmation: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface DaySchedule {
  date: string;
  householdId: string;
  slots: ScheduleSlot[];
  generatedAt: string;
  inputHash: string;
}
