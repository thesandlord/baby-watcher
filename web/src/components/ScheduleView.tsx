import { useState } from 'react';
import type { DaySchedule } from '@baby-watcher/shared';
import { memberColor, memberInitials } from '../lib/members';
import { formatDisplayDate, formatSlotTime, type UserProfile } from '../lib/utils';
import { HouseholdMenu } from './HouseholdMenu';

interface ScheduleViewProps {
  profile: UserProfile;
  schedule: DaySchedule | null;
  selectedDate: string;
  busy: boolean;
  error: string | null;
  onDateChange: (date: string) => void;
  onRegenerate: () => void;
  onSignOut: () => void;
}

export function ScheduleView({
  profile,
  schedule,
  selectedDate,
  busy,
  error,
  onDateChange,
  onRegenerate,
  onSignOut,
}: ScheduleViewProps) {
  const memberIds = profile.household?.members.map((member) => member.userId) ?? [];
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div className="schedule-header schedule-header-compact">
        <div className="schedule-meta">
          <h1 className="hero-title">{formatDisplayDate(selectedDate)}</h1>
        </div>
        <button
          type="button"
          className="icon-button menu-button"
          aria-label="Open household menu"
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
      </div>

      <label className="day-picker-row">
        <span className="field-label">Choose day</span>
        <input
          className="date-input"
          type="date"
          value={selectedDate}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </label>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="schedule-list">
        {schedule?.slots.map((slot) => {
          const accent = slot.watcherId
            ? memberColor(slot.watcherId, memberIds)
            : 'var(--danger)';

          return (
            <div
              key={`${slot.start}-${slot.end}`}
              className="schedule-row"
              style={{ ['--slot-accent' as string]: accent }}
            >
              <div className="schedule-time">
                {formatSlotTime(slot.start)}
                <br />
                {formatSlotTime(slot.end)}
              </div>
              <div
                className={
                  slot.watcherId ? 'schedule-watcher' : 'schedule-watcher unassigned'
                }
              >
                {slot.watcherId ? (
                  <span
                    className="member-avatar"
                    style={{ background: accent }}
                  >
                    {memberInitials(slot.watcherName)}
                  </span>
                ) : null}
                {slot.watcherName}
              </div>
              <span className="schedule-duration">30m</span>
            </div>
          );
        })}

        {!schedule && !busy ? (
          <div className="card muted-copy">
            Upload a calendar screenshot to generate the first schedule for this day.
          </div>
        ) : null}
      </div>

      <HouseholdMenu
        profile={profile}
        busy={busy}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onRegenerate={() => {
          onRegenerate();
        }}
        onSignOut={() => {
          setMenuOpen(false);
          onSignOut();
        }}
      />
    </>
  );
}
