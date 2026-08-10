import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  generateTimeSlots,
  SLOT_MINUTES,
  WORKDAY_END,
  WORKDAY_START,
  type BusySlot,
  type DaySchedule,
  type ScheduleSlot,
} from '@baby-watcher/shared';
import { memberColor, memberInitials } from '../lib/members';
import { useSlotActivation } from '../lib/useSlotActivation';
import {
  activeWatchSlotAtNow,
  currentTimeLineFraction,
  formatCalendarDate,
  formatDisplayDate,
  formatSlotTime,
  formatViewHeading,
  householdWatchers,
  todayIsoDate,
  type ScheduleViewMode,
  type UserProfile,
} from '../lib/utils';
import type { UploadedAvailability } from '../lib/firestore-api';
import { DayScheduleBoard } from './DayScheduleBoard';
import { HouseholdMenu } from './HouseholdMenu';
import { CurrentTimeLine } from './CurrentTimeLine';

interface ScheduleViewProps {
  profile: UserProfile;
  schedules: Record<string, DaySchedule | null>;
  viewDates: string[];
  activeDate: string;
  viewMode: ScheduleViewMode;
  uploads: UploadedAvailability[];
  householdUploads: UploadedAvailability[];
  busy: boolean;
  error: string | null;
  canEditSchedule: boolean;
  uploadMeetingsButton: ReactNode;
  onActiveDateChange: (date: string) => void;
  onViewModeChange: (mode: ScheduleViewMode) => void;
  onPreviousPeriod: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  onGenerate: (date: string) => void;
  onAssign: (date: string, start: string, watcherId: string | null) => void;
  onUpdateBusySlots?: (date: string, userId: string, busySlots: BusySlot[]) => void;
  onDeleteUpload: (date: string) => void;
  onCleanupOldUploads: () => void;
  onSignOut: () => void;
}

interface SlotCellProps {
  date: string;
  slot: ScheduleSlot;
  memberIds: string[];
  disabled: boolean;
  onClick: () => void;
}

function SlotCell({ date, slot, memberIds, disabled, onClick }: SlotCellProps) {
  const activation = useSlotActivation(onClick, disabled);
  const accent = slot.watcherId
    ? memberColor(slot.watcherId, memberIds)
    : 'var(--text-muted)';
  const style = {
    '--slot-accent': accent,
  } as CSSProperties;

  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={`slot-${date}-${slot.start}`}
      data-date={date}
      data-start={slot.start}
      data-watcher-id={slot.watcherId ?? ''}
      className="week-slot"
      style={style}
      aria-label={`${formatDisplayDate(date)}, ${formatSlotTime(slot.start)}: ${slot.watcherName}`}
      onDoubleClick={activation.onDoubleClick}
      onClick={activation.onClick}
      onPointerDown={activation.onPointerDown}
      onPointerMove={activation.onPointerMove}
      onPointerUp={activation.onPointerUp}
      onPointerCancel={activation.onPointerCancel}
    >
      <span className="week-slot-name">{slot.watcherName}</span>
      {slot.isManualOverride ? <span className="manual-dot" title="Manually changed" /> : null}
    </button>
  );
}

export function ScheduleView({
  profile,
  schedules,
  viewDates,
  activeDate,
  viewMode,
  uploads,
  householdUploads,
  busy,
  error,
  canEditSchedule,
  uploadMeetingsButton,
  onActiveDateChange,
  onViewModeChange,
  onPreviousPeriod,
  onNextPeriod,
  onToday,
  onGenerate,
  onAssign,
  onUpdateBusySlots,
  onDeleteUpload,
  onCleanupOldUploads,
  onSignOut,
}: ScheduleViewProps) {
  const watchers = householdWatchers(profile.household?.members ?? []);
  const memberIds = watchers.map((member) => member.userId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{ date: string; slot: ScheduleSlot } | null>(null);
  const [uploadStatusDate, setUploadStatusDate] = useState<string | null>(null);
  const slotEditingDisabled = busy || !canEditSchedule;
  const firstSchedule = viewDates.map((date) => schedules[date]).find(Boolean);
  const timeSlots = firstSchedule?.slots ?? generateTimeSlots(WORKDAY_START, WORKDAY_END, SLOT_MINUTES);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const slotsStartRef = useRef<HTMLDivElement>(null);
  const slotsEndRef = useRef<HTMLDivElement>(null);
  const columnsStartRef = useRef<HTMLDivElement>(null);
  const columnsEndRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const today = todayIsoDate();
  const nowLineFraction = currentTimeLineFraction(now, WORKDAY_START, WORKDAY_END);
  const showNowLine = viewDates.includes(today) && nowLineFraction !== null;
  const activeWatchSlot = activeWatchSlotAtNow(schedules[today]?.slots ?? [], now);
  const isOnWatch = activeWatchSlot?.watcherId === profile.uid;

  useEffect(() => {
    setNow(new Date());
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  function renderSlotCell(props: SlotCellProps) {
    return <SlotCell {...props} />;
  }

  const viewHeading = formatViewHeading(viewDates);

  return (
    <div className="schedule-view">
      <div className={`schedule-header week-toolbar${viewHeading ? '' : ' week-toolbar-compact'}`}>
        {viewHeading ? (
          <div className="schedule-meta">
            <h1 className="hero-title" data-testid="view-heading">
              {viewHeading}
            </h1>
          </div>
        ) : (
          <span data-testid="view-heading" hidden />
        )}
        <div className="week-toolbar-actions">
          <div className="view-mode-toggle" role="group" aria-label="Calendar view mode">
            <button
              type="button"
              className={`view-mode-button${viewMode === 'day' ? ' active' : ''}`}
              data-testid="view-mode-day"
              aria-pressed={viewMode === 'day'}
              onClick={() => onViewModeChange('day')}
            >
              1 day
            </button>
            <button
              type="button"
              className={`view-mode-button${viewMode === 'three-day' ? ' active' : ''}`}
              data-testid="view-mode-three-day"
              aria-pressed={viewMode === 'three-day'}
              onClick={() => onViewModeChange('three-day')}
            >
              3 days
            </button>
          </div>
          <button type="button" className="ghost-button today-button" onClick={onToday}>
            Today
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onPreviousPeriod}
            aria-label={viewMode === 'day' ? 'Previous day' : 'Previous 3 days'}
          >
            ‹
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onNextPeriod}
            aria-label={viewMode === 'day' ? 'Next day' : 'Next 3 days'}
          >
            ›
          </button>
          {uploadMeetingsButton}
          <button
            type="button"
            className="icon-button menu-button"
            aria-label="Open profile and household menu"
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
        </div>
      </div>

      {isOnWatch && activeWatchSlot ? (
        <div
          className="on-watch-banner"
          role="status"
          data-testid="on-watch-banner"
          style={
            {
              '--banner-accent': memberColor(profile.uid, memberIds),
            } as CSSProperties
          }
        >
          <strong>You&apos;re on watch</strong>
          <span>
            {formatSlotTime(activeWatchSlot.start)} – {formatSlotTime(activeWatchSlot.end)}
          </span>
        </div>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="schedule-scroll-area">
        <div className="week-scroll">
          {viewMode === 'day' ? (
            <DayScheduleBoard
              date={activeDate}
              profile={profile}
              schedule={schedules[activeDate] ?? null}
              householdUploads={householdUploads}
              timeSlots={timeSlots}
              memberIds={memberIds}
              busy={busy}
              canEditSchedule={canEditSchedule}
              showNowLine={showNowLine}
              nowLineFraction={nowLineFraction ?? 0}
              onGenerate={onGenerate}
              onUploadStatus={setUploadStatusDate}
              onEditSlot={(date, slot) => setEditing({ date, slot })}
              onUpdateBusySlots={canEditSchedule ? onUpdateBusySlots : undefined}
              renderSlotCell={renderSlotCell}
            />
          ) : (
            <div className="week-grid-wrapper" ref={gridWrapperRef}>
              <div
                className="week-grid"
                data-testid="week-grid"
                style={{ '--day-count': viewDates.length } as CSSProperties}
              >
                <div className="week-corner" />
                {viewDates.map((date) => {
                  const dayNumber = formatCalendarDate(date, { day: 'numeric' });
                  const isToday = date === today;
                  return (
                    <button
                      key={date}
                      type="button"
                      data-testid={`day-${date}`}
                      data-date={date}
                      className={`week-day-header${activeDate === date ? ' active' : ''}${isToday ? ' today' : ''}`}
                      onClick={() => onActiveDateChange(date)}
                    >
                      <span>{formatCalendarDate(date, { weekday: 'short' })}</span>
                      <strong>{dayNumber}</strong>
                    </button>
                  );
                })}

                <div className="week-footer-label">Slots</div>
                {viewDates.map((date) => {
                  const uploadedCount = new Set(
                    householdUploads
                      .filter((upload) => upload.date === date && memberIds.includes(upload.userId))
                      .map((upload) => upload.userId)
                  ).size;
                  return (
                    <div className="week-day-action" key={date}>
                      {canEditSchedule ? (
                        <button
                          type="button"
                          data-testid={`generate-${date}`}
                          className={schedules[date] ? 'ghost-button generate-button' : 'primary-button generate-button'}
                          disabled={busy}
                          onClick={() => onGenerate(date)}
                        >
                          {schedules[date] ? 'Regenerate' : 'Generate slots'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-testid={`upload-status-${date}`}
                        className="upload-status-button"
                        aria-label={`View upload status for ${formatDisplayDate(date)}`}
                        onClick={() => setUploadStatusDate(date)}
                      >
                        {uploadedCount}/{memberIds.length} uploaded
                      </button>
                    </div>
                  );
                })}

                {timeSlots.map((timeSlot, rowIndex) => (
                  <div className="week-grid-row" key={timeSlot.start}>
                    <div
                      className="week-time"
                      ref={
                        rowIndex === 0
                          ? slotsStartRef
                          : rowIndex === timeSlots.length - 1
                            ? slotsEndRef
                            : undefined
                      }
                    >
                      {formatSlotTime(timeSlot.start)}
                    </div>
                    {viewDates.map((date, dateIndex) => {
                      const slot = schedules[date]?.slots[rowIndex];
                      return (
                        <div
                          className="week-cell"
                          key={`${date}-${timeSlot.start}`}
                          ref={
                            rowIndex === 0
                              ? dateIndex === 0
                                ? columnsStartRef
                                : dateIndex === viewDates.length - 1
                                  ? columnsEndRef
                                  : undefined
                              : undefined
                          }
                        >
                          {slot ? (
                            renderSlotCell({
                              date,
                              slot,
                              memberIds,
                              disabled: slotEditingDisabled,
                              onClick: () => {
                                if (!canEditSchedule) {
                                  return;
                                }
                                onActiveDateChange(date);
                                setEditing({ date, slot });
                              },
                            })
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <CurrentTimeLine
                visible={showNowLine}
                fraction={nowLineFraction ?? 0}
                gridRef={gridWrapperRef}
                slotsStartRef={slotsStartRef}
                slotsEndRef={slotsEndRef}
                columnsStartRef={columnsStartRef}
                columnsEndRef={columnsEndRef}
              />
            </div>
          )}
          {!firstSchedule && !busy ? (
            <div className="week-empty-hint">
              Upload availability, then generate watch slots for this day.
            </div>
          ) : null}
        </div>
      </div>

      <HouseholdMenu
        profile={profile}
        uploads={uploads}
        busy={busy}
        open={menuOpen}
        canEditSchedule={canEditSchedule}
        onClose={() => setMenuOpen(false)}
        onDeleteUpload={canEditSchedule ? onDeleteUpload : () => undefined}
        onCleanupOldUploads={canEditSchedule ? onCleanupOldUploads : () => undefined}
        onSelectUploadDate={(date) => {
          onActiveDateChange(date);
          setMenuOpen(false);
        }}
        onSignOut={() => {
          setMenuOpen(false);
          onSignOut();
        }}
      />

      {uploadStatusDate ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setUploadStatusDate(null)}>
          <div
            className="modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Upload status for ${formatDisplayDate(uploadStatusDate)}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="hero-title" style={{ fontSize: '1.25rem' }}>
              Schedule uploads
            </h2>
            <p className="hero-subtitle">{formatDisplayDate(uploadStatusDate)}</p>
            <div className="upload-status-list">
              {watchers.map((member) => {
                const hasUploaded = householdUploads.some(
                  (upload) => upload.date === uploadStatusDate && upload.userId === member.userId
                );
                return (
                  <div className="upload-status-person" key={member.userId}>
                    <span>{member.displayName}</span>
                    <strong className={hasUploaded ? 'has-uploaded' : 'not-uploaded'}>
                      {hasUploaded ? 'Uploaded' : 'Not uploaded'}
                    </strong>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setUploadStatusDate(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing && canEditSchedule ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditing(null)}>
          <div
            className="modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Override watcher"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="hero-title" style={{ fontSize: '1.25rem' }}>Choose watcher</h2>
            <p className="hero-subtitle">
              {formatDisplayDate(editing.date)} at {formatSlotTime(editing.slot.start)}
            </p>
            <div className="assignment-options">
              {watchers.map((member) => (
                <button
                  key={member.userId}
                  type="button"
                  className="assignment-option"
                  aria-label={member.displayName}
                  onClick={() => {
                    onAssign(editing.date, editing.slot.start, member.userId);
                    setEditing(null);
                  }}
                >
                  <span
                    className="member-avatar"
                    style={{ background: memberColor(member.userId, memberIds) }}
                  >
                    {memberInitials(member.displayName)}
                  </span>
                  {member.displayName}
                </button>
              ))}
              <button
                type="button"
                className="assignment-option unassigned-option"
                onClick={() => {
                  onAssign(editing.date, editing.slot.start, null);
                  setEditing(null);
                }}
              >
                Unassigned
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
