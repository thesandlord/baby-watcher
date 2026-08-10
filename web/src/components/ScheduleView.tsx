import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  generateTimeSlots,
  WORKDAY_END,
  WORKDAY_START,
  type DaySchedule,
  type ScheduleSlot,
} from '@baby-watcher/shared';
import { memberColor, memberInitials } from '../lib/members';
import {
  currentTimeLineFraction,
  formatDisplayDate,
  formatSlotTime,
  formatWeekRange,
  todayIsoDate,
  type UserProfile,
} from '../lib/utils';
import type { UploadedAvailability } from '../lib/firestore-api';
import { HouseholdMenu } from './HouseholdMenu';

interface ScheduleViewProps {
  profile: UserProfile;
  schedules: Record<string, DaySchedule | null>;
  weekDates: string[];
  activeDate: string;
  uploads: UploadedAvailability[];
  householdUploads: UploadedAvailability[];
  busy: boolean;
  error: string | null;
  uploadMeetingsButton: ReactNode;
  onActiveDateChange: (date: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onGenerate: (date: string) => void;
  onSwap: (sourceDate: string, sourceStart: string, targetDate: string, targetStart: string) => void;
  onAssign: (date: string, start: string, watcherId: string | null) => void;
  onDeleteUpload: (date: string) => void;
  onSignOut: () => void;
}

function slotId(date: string, start: string): string {
  return `${date}|${start}`;
}

function parseSlotId(id: string): [string, string] {
  const [date, start] = id.split('|');
  return [date, start];
}

interface SlotCellProps {
  date: string;
  slot: ScheduleSlot;
  memberIds: string[];
  disabled: boolean;
  onClick: () => void;
}

function SlotCell({ date, slot, memberIds, disabled, onClick }: SlotCellProps) {
  const id = slotId(date, slot.start);
  const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } =
    useDraggable({ id, disabled });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id, disabled });
  const accent = slot.watcherId
    ? memberColor(slot.watcherId, memberIds)
    : 'var(--text-muted)';
  const style = {
    '--slot-accent': accent,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  } as CSSProperties;

  return (
    <button
      ref={(node) => {
        setDraggableRef(node);
        setDroppableRef(node);
      }}
      type="button"
      disabled={disabled}
      data-testid={`slot-${date}-${slot.start}`}
      data-date={date}
      data-start={slot.start}
      data-watcher-id={slot.watcherId ?? ''}
      className={`week-slot${isDragging ? ' dragging' : ''}${isOver ? ' drag-over' : ''}`}
      style={style}
      onClick={onClick}
      aria-label={`${formatDisplayDate(date)}, ${formatSlotTime(slot.start)}: ${slot.watcherName}`}
      {...listeners}
      {...attributes}
    >
      <span className="week-slot-name">{slot.watcherName}</span>
      {slot.isManualOverride ? <span className="manual-dot" title="Manually changed" /> : null}
    </button>
  );
}

interface CurrentTimeLineProps {
  visible: boolean;
  fraction: number;
  gridRef: RefObject<HTMLDivElement | null>;
  slotsStartRef: RefObject<HTMLDivElement | null>;
  slotsEndRef: RefObject<HTMLDivElement | null>;
  todayColumnRef: RefObject<HTMLDivElement | null>;
}

function CurrentTimeLine({
  visible,
  fraction,
  gridRef,
  slotsStartRef,
  slotsEndRef,
  todayColumnRef,
}: CurrentTimeLineProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!visible) {
      setStyle(null);
      return;
    }

    function measure() {
      const grid = gridRef.current;
      const slotsStart = slotsStartRef.current;
      const slotsEnd = slotsEndRef.current;
      const todayColumn = todayColumnRef.current;
      if (!grid || !slotsStart || !slotsEnd || !todayColumn) {
        setStyle(null);
        return;
      }

      const gridRect = grid.getBoundingClientRect();
      const slotsTop = slotsStart.getBoundingClientRect().top - gridRect.top;
      const slotsHeight =
        slotsEnd.getBoundingClientRect().bottom - slotsStart.getBoundingClientRect().top;
      const columnRect = todayColumn.getBoundingClientRect();

      setStyle({
        top: slotsTop + fraction * slotsHeight,
        left: columnRect.left - gridRect.left,
        width: columnRect.width,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (gridRef.current) {
      observer.observe(gridRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [visible, fraction, gridRef, slotsStartRef, slotsEndRef, todayColumnRef]);

  if (!visible || !style) {
    return null;
  }

  return (
    <div
      className="week-now-line"
      style={style}
      aria-hidden="true"
      data-testid="current-time-line"
    />
  );
}

export function ScheduleView({
  profile,
  schedules,
  weekDates,
  activeDate,
  uploads,
  householdUploads,
  busy,
  error,
  uploadMeetingsButton,
  onActiveDateChange,
  onPreviousWeek,
  onNextWeek,
  onToday,
  onGenerate,
  onSwap,
  onAssign,
  onDeleteUpload,
  onSignOut,
}: ScheduleViewProps) {
  const memberIds = profile.household?.members.map((member) => member.userId) ?? [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{ date: string; slot: ScheduleSlot } | null>(null);
  const [uploadStatusDate, setUploadStatusDate] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );
  const firstSchedule = weekDates.map((date) => schedules[date]).find(Boolean);
  const timeSlots = firstSchedule?.slots ?? generateTimeSlots(WORKDAY_START, WORKDAY_END, 30);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const slotsStartRef = useRef<HTMLDivElement>(null);
  const slotsEndRef = useRef<HTMLDivElement>(null);
  const todayColumnRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const today = todayIsoDate();
  const nowLineFraction = currentTimeLineFraction(now, WORKDAY_START, WORKDAY_END);
  const showNowLine = weekDates.includes(today) && nowLineFraction !== null;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) {
      return;
    }
    const [sourceDate, sourceStart] = parseSlotId(String(event.active.id));
    const [targetDate, targetStart] = parseSlotId(String(event.over.id));
    onSwap(sourceDate, sourceStart, targetDate, targetStart);
  }

  return (
    <>
      <div className="schedule-header week-toolbar">
        <div className="schedule-meta">
          <h1 className="hero-title">{formatWeekRange(weekDates)}</h1>
        </div>
        <div className="week-toolbar-actions">
          <button type="button" className="ghost-button today-button" onClick={onToday}>
            Today
          </button>
          <button type="button" className="icon-button" onClick={onPreviousWeek} aria-label="Previous week">
            ‹
          </button>
          <button type="button" className="icon-button" onClick={onNextWeek} aria-label="Next week">
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

      {error ? <div className="error-banner">{error}</div> : null}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="week-scroll">
          <div className="week-grid-wrapper" ref={gridWrapperRef}>
            <div className="week-grid" data-testid="week-grid">
              <div className="week-corner" />
              {weekDates.map((date) => {
                const parsed = new Date(`${date}T12:00:00`);
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
                    <span>{parsed.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <strong>{parsed.getDate()}</strong>
                  </button>
                );
              })}

              <div className="week-footer-label">Slots</div>
              {weekDates.map((date) => {
                const uploadedCount = new Set(
                  householdUploads
                    .filter((upload) => upload.date === date)
                    .map((upload) => upload.userId)
                ).size;
                return (
                  <div className="week-day-action" key={date}>
                    <button
                      type="button"
                      data-testid={`generate-${date}`}
                      className={schedules[date] ? 'ghost-button generate-button' : 'primary-button generate-button'}
                      disabled={busy}
                      onClick={() => onGenerate(date)}
                    >
                      {schedules[date] ? 'Regenerate' : 'Generate slots'}
                    </button>
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
                  {weekDates.map((date) => {
                    const slot = schedules[date]?.slots[rowIndex];
                    return (
                      <div
                        className="week-cell"
                        key={`${date}-${timeSlot.start}`}
                        ref={date === today && rowIndex === 0 ? todayColumnRef : undefined}
                      >
                        {slot ? (
                          <SlotCell
                            date={date}
                            slot={slot}
                            memberIds={memberIds}
                            disabled={busy}
                            onClick={() => {
                              onActiveDateChange(date);
                              setEditing({ date, slot });
                            }}
                          />
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
              todayColumnRef={todayColumnRef}
            />
          </div>
          {!firstSchedule && !busy ? (
            <div className="week-empty-hint">
              Upload availability, then generate slots under each day.
            </div>
          ) : null}
        </div>
      </DndContext>

      <HouseholdMenu
        profile={profile}
        uploads={uploads}
        busy={busy}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onDeleteUpload={onDeleteUpload}
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
              {profile.household?.members.map((member) => {
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

      {editing ? (
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
              {profile.household?.members.map((member) => (
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
    </>
  );
}
