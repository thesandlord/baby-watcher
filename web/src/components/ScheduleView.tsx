import type { DaySchedule } from '@baby-watcher/shared';
import { formatDisplayDate, formatSlotTime, type UserProfile } from '../lib/utils';

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
  return (
    <>
      <div className="schedule-header">
        <div>
          <h1 className="hero-title">Today&apos;s schedule</h1>
          <p className="hero-subtitle">{formatDisplayDate(selectedDate)}</p>
        </div>
        <button type="button" className="ghost-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      <div className="card stack" style={{ marginBottom: '1rem' }}>
        <label>
          <span className="field-label">Choose day</span>
          <input
            className="date-input"
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>

        <div className="stack">
          <span className="field-label">Household members</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {profile.household?.members.map((member) => (
              <span key={member.userId} className="member-pill">
                {member.displayName}
              </span>
            ))}
          </div>
        </div>

        {profile.household?.inviteCode ? (
          <p className="hero-subtitle">
            Invite code: <strong>{profile.household.inviteCode}</strong>
          </p>
        ) : null}

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={onRegenerate}
        >
          {busy ? 'Working...' : 'Regenerate schedule'}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="schedule-list">
        {schedule?.slots.map((slot) => (
          <div key={`${slot.start}-${slot.end}`} className="schedule-row">
            <div className="schedule-time">
              {formatSlotTime(slot.start)}
              <br />
              {formatSlotTime(slot.end)}
            </div>
            <div
              className={
                slot.watcherId
                  ? 'schedule-watcher'
                  : 'schedule-watcher unassigned'
              }
            >
              {slot.watcherName}
            </div>
          </div>
        ))}

        {!schedule && !busy ? (
          <div className="card">
            Upload a calendar screenshot to generate the first schedule for this day.
          </div>
        ) : null}
      </div>
    </>
  );
}
