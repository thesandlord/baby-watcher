import type { DaySchedule } from '@baby-watcher/shared';
import { memberColor, memberInitials } from '../lib/members';
import { formatDisplayDate, formatSlotTime, type UserProfile } from '../lib/utils';
import { ThemeToggle } from './ThemeToggle';

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

  return (
    <>
      <div className="schedule-header">
        <div className="schedule-meta">
          <span className="schedule-badge">Today&apos;s schedule</span>
          <h1 className="hero-title">{formatDisplayDate(selectedDate)}</h1>
          <p className="hero-subtitle">30-minute coverage from 8am to 5pm</p>
        </div>
        <div className="top-bar-actions">
          <ThemeToggle compact />
          <button type="button" className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="card control-grid" style={{ marginBottom: '1rem' }}>
        <label>
          <span className="field-label">Choose day</span>
          <input
            className="date-input"
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>

        <div>
          <span className="field-label">Household members</span>
          <div className="member-list">
            {profile.household?.members.map((member) => (
              <span key={member.userId} className="member-pill">
                <span
                  className="member-avatar"
                  style={{ background: memberColor(member.userId, memberIds) }}
                >
                  {memberInitials(member.displayName)}
                </span>
                {member.displayName}
              </span>
            ))}
          </div>
        </div>

        {profile.household?.inviteCode ? (
          <div className="invite-chip">
            <div>
              <span className="field-label">Invite code</span>
              <div className="invite-code">{profile.household.inviteCode}</div>
            </div>
          </div>
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
    </>
  );
}
