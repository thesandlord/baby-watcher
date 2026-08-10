import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  WORKDAY_END,
  WORKDAY_START,
  MEETING_GRID_MINUTES,
  SLOT_MINUTES,
  type BusySlot,
  type DaySchedule,
  type ScheduleSlot,
} from '@baby-watcher/shared';
import { memberColor, memberInitials } from '../lib/members';
import { parseWallClockTime } from '../lib/timezone';
import {
  formatDisplayDate,
  formatShortDate,
  formatSlotTime,
  type UserProfile,
} from '../lib/utils';
import type { UploadedAvailability } from '../lib/firestore-api';

const SLOT_HEIGHT_REM = 3;
const DRAG_THRESHOLD_PX = 6;
const MIN_MEETING_MINUTES = MEETING_GRID_MINUTES;

const DEFAULT_MEETING_MINUTES = SLOT_MINUTES;

interface DayScheduleBoardProps {
  date: string;
  profile: UserProfile;
  schedule: DaySchedule | null;
  householdUploads: UploadedAvailability[];
  timeSlots: Array<{ start: string; end: string }>;
  memberIds: string[];
  busy: boolean;
  showNowLine: boolean;
  nowLineFraction: number;
  onGenerate: (date: string) => void;
  onUploadStatus: (date: string) => void;
  onEditSlot: (date: string, slot: ScheduleSlot) => void;
  onUpdateBusySlots?: (date: string, userId: string, busySlots: BusySlot[]) => void;
  renderSlotCell: (props: {
    date: string;
    slot: ScheduleSlot;
    memberIds: string[];
    disabled: boolean;
    onClick: () => void;
  }) => ReactNode;
}

interface MeetingFormState {
  mode: 'add' | 'edit';
  memberUserId: string;
  memberName: string;
  slotIndex: number;
  busySlot: BusySlot;
}

function sortBusySlots(slots: BusySlot[]): BusySlot[] {
  return [...slots].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function defaultMeetingEnd(start: string, metrics: ReturnType<typeof workdayMetrics>): string {
  const startMinutes = timeToMinutes(start);
  const endMinutes = Math.min(startMinutes + DEFAULT_MEETING_MINUTES, metrics.endMinutes);
  return minutesToTime(Math.max(endMinutes, startMinutes + MIN_MEETING_MINUTES));
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function workdayMetrics(start = WORKDAY_START, end = WORKDAY_END) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  return { startMinutes, endMinutes, totalMinutes: endMinutes - startMinutes };
}

function meetingBlockStyle(
  busySlot: BusySlot,
  metrics: ReturnType<typeof workdayMetrics>
): CSSProperties {
  const slotStart = timeToMinutes(busySlot.start);
  const slotEnd = timeToMinutes(busySlot.end);
  const clampedStart = Math.max(slotStart, metrics.startMinutes);
  const clampedEnd = Math.min(slotEnd, metrics.endMinutes);

  if (clampedEnd <= clampedStart) {
    return { display: 'none' };
  }

  const top = ((clampedStart - metrics.startMinutes) / metrics.totalMinutes) * 100;
  const height = ((clampedEnd - clampedStart) / metrics.totalMinutes) * 100;

  return {
    top: `${top}%`,
    height: `${height}%`,
  };
}

function getMemberBusySlots(
  userId: string,
  date: string,
  householdUploads: UploadedAvailability[]
): BusySlot[] {
  return (
    householdUploads.find((upload) => upload.date === date && upload.userId === userId)
      ?.busySlots ?? []
  );
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function snapMinutes(minutes: number, grid = MEETING_GRID_MINUTES): number {
  return Math.round(minutes / grid) * grid;
}

function shiftBusySlot(
  busySlot: BusySlot,
  deltaMinutes: number,
  metrics: ReturnType<typeof workdayMetrics>
): BusySlot {
  const duration = timeToMinutes(busySlot.end) - timeToMinutes(busySlot.start);
  let nextStart = snapMinutes(timeToMinutes(busySlot.start) + deltaMinutes);
  let nextEnd = nextStart + duration;

  if (nextStart < metrics.startMinutes) {
    nextStart = metrics.startMinutes;
    nextEnd = nextStart + duration;
  }
  if (nextEnd > metrics.endMinutes) {
    nextEnd = metrics.endMinutes;
    nextStart = nextEnd - duration;
  }

  return {
    ...busySlot,
    start: minutesToTime(nextStart),
    end: minutesToTime(nextEnd),
  };
}

function resizeBusySlot(
  busySlot: BusySlot,
  edge: 'start' | 'end',
  deltaMinutes: number,
  metrics: ReturnType<typeof workdayMetrics>
): BusySlot {
  const startMinutes = timeToMinutes(busySlot.start);
  const endMinutes = timeToMinutes(busySlot.end);
  const snappedDelta = snapMinutes(deltaMinutes);

  if (edge === 'start') {
    let nextStart = snapMinutes(startMinutes + snappedDelta);
    nextStart = Math.max(metrics.startMinutes, Math.min(nextStart, endMinutes - MIN_MEETING_MINUTES));
    return { ...busySlot, start: minutesToTime(nextStart) };
  }

  let nextEnd = snapMinutes(endMinutes + snappedDelta);
  nextEnd = Math.min(metrics.endMinutes, Math.max(nextEnd, startMinutes + MIN_MEETING_MINUTES));
  return { ...busySlot, end: minutesToTime(nextEnd) };
}

type InteractionMode = 'idle' | 'drag' | 'resize-start' | 'resize-end';

interface MeetingBlockProps {
  busySlot: BusySlot;
  slotIndex: number;
  memberUserId: string;
  accent: string;
  metrics: ReturnType<typeof workdayMetrics>;
  trackHeight: number;
  editable: boolean;
  disabled: boolean;
  busySlots: BusySlot[];
  onUpdateBusySlots: (busySlots: BusySlot[]) => void;
  onEdit: () => void;
}

function MeetingBlock({
  busySlot,
  slotIndex,
  memberUserId,
  accent,
  metrics,
  trackHeight,
  editable,
  disabled,
  busySlots,
  onUpdateBusySlots,
  onEdit,
}: MeetingBlockProps) {
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const startClientYRef = useRef(0);
  const modeRef = useRef<InteractionMode>('idle');
  const movedRef = useRef(false);
  const blockRef = useRef<HTMLDivElement>(null);

  function finishInteraction(deltaY: number) {
    if (!editable || disabled || trackHeight <= 0) {
      return;
    }

    const mode = modeRef.current;
    if (mode === 'idle' || deltaY === 0) {
      return;
    }

    const deltaMinutes = (deltaY / trackHeight) * metrics.totalMinutes;

    if (mode === 'drag') {
      const nextSlot = shiftBusySlot(busySlot, deltaMinutes, metrics);
      if (nextSlot.start === busySlot.start && nextSlot.end === busySlot.end) {
        return;
      }
      const nextBusySlots = busySlots.map((slot, index) => (index === slotIndex ? nextSlot : slot));
      onUpdateBusySlots(nextBusySlots);
      return;
    }

    const edge = mode === 'resize-start' ? 'start' : 'end';
    const nextSlot = resizeBusySlot(busySlot, edge, deltaMinutes, metrics);
    if (nextSlot.start === busySlot.start && nextSlot.end === busySlot.end) {
      return;
    }
    const nextBusySlots = busySlots.map((slot, index) => (index === slotIndex ? nextSlot : slot));
    onUpdateBusySlots(nextBusySlots);
  }

  function resetInteraction() {
    modeRef.current = 'idle';
    movedRef.current = false;
    setInteracting(false);
    setDragOffsetY(0);
  }

  function resolveMode(target: EventTarget | null): InteractionMode {
    if (!(target instanceof Element)) {
      return 'drag';
    }
    if (target.closest('.day-meeting-resize-start')) {
      return 'resize-start';
    }
    if (target.closest('.day-meeting-resize-end')) {
      return 'resize-end';
    }
    return 'drag';
  }

  function beginInteraction(event: React.PointerEvent) {
    if (!editable || disabled) {
      return;
    }
    const mode = resolveMode(event.target);
    blockRef.current?.setPointerCapture(event.pointerId);
    startClientYRef.current = event.clientY;
    modeRef.current = mode;
    movedRef.current = false;
    setInteracting(true);
    setDragOffsetY(0);
  }

  const blockStyle = meetingBlockStyle(busySlot, metrics);
  if (blockStyle.display === 'none') {
    return null;
  }

  const isDragging = modeRef.current === 'drag' && interacting;
  const isResizing = interacting && modeRef.current.startsWith('resize');

  return (
    <div
      ref={blockRef}
      className={`day-meeting-block${editable ? ' editable' : ''}${isDragging ? ' dragging' : ''}${isResizing ? ' resizing' : ''}`}
      data-testid={`meeting-${memberUserId}-${busySlot.start}`}
      style={{
        ...blockStyle,
        '--meeting-accent': accent,
        transform: dragOffsetY ? `translateY(${dragOffsetY}px)` : undefined,
      } as CSSProperties}
      title={
        busySlot.title
          ? `${busySlot.start}–${busySlot.end} · ${busySlot.title}`
          : `${busySlot.start}–${busySlot.end}`
      }
      onPointerDown={
        editable && !disabled
          ? beginInteraction
          : undefined
      }
      onPointerMove={
        editable && !disabled
          ? (event) => {
              if (modeRef.current === 'idle') {
                return;
              }
              const deltaY = event.clientY - startClientYRef.current;
              if (Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
                movedRef.current = true;
              }
              if (modeRef.current === 'drag') {
                setDragOffsetY(deltaY);
              }
            }
          : undefined
      }
      onPointerUp={
        editable && !disabled
          ? (event) => {
              if (modeRef.current === 'idle') {
                return;
              }
              const deltaY = event.clientY - startClientYRef.current;
              const mode = modeRef.current;
              const didMove = movedRef.current;
              resetInteraction();
              if (!didMove && mode === 'drag') {
                onEdit();
                return;
              }
              finishInteraction(deltaY);
            }
          : undefined
      }
      onPointerCancel={
        editable && !disabled
          ? () => resetInteraction()
          : undefined
      }
    >
      {editable ? (
        <div
          className="day-meeting-resize-handle day-meeting-resize-start"
          aria-hidden="true"
        />
      ) : null}
      <span className="day-meeting-time">
        {formatSlotTime(busySlot.start)}–{formatSlotTime(busySlot.end)}
      </span>
      {busySlot.title ? (
        <span className="day-meeting-title">{busySlot.title}</span>
      ) : null}
      {editable ? (
        <div
          className="day-meeting-resize-handle day-meeting-resize-end"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

interface NowLineProps {
  visible: boolean;
  fraction: number;
  boardRef: RefObject<HTMLDivElement | null>;
  slotsStartRef: RefObject<HTMLDivElement | null>;
  slotsEndRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLDivElement | null>;
}

function DayNowLine({
  visible,
  fraction,
  boardRef,
  slotsStartRef,
  slotsEndRef,
  trackRef,
}: NowLineProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!visible) {
      setStyle(null);
      return;
    }

    function measure() {
      const board = boardRef.current;
      const slotsStart = slotsStartRef.current;
      const slotsEnd = slotsEndRef.current;
      const track = trackRef.current;
      if (!board || !slotsStart || !slotsEnd || !track) {
        setStyle(null);
        return;
      }

      const boardRect = board.getBoundingClientRect();
      const slotsTop = slotsStart.getBoundingClientRect().top - boardRect.top;
      const slotsHeight =
        slotsEnd.getBoundingClientRect().bottom - slotsStart.getBoundingClientRect().top;
      const trackRect = track.getBoundingClientRect();

      setStyle({
        top: slotsTop + fraction * slotsHeight,
        left: trackRect.left - boardRect.left,
        width: trackRect.width,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (boardRef.current) {
      observer.observe(boardRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [visible, fraction, boardRef, slotsStartRef, slotsEndRef, trackRef]);

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

interface MeetingFormModalProps {
  date: string;
  form: MeetingFormState;
  busy: boolean;
  editStart: string;
  editEnd: string;
  editTitle: string;
  editError: string | null;
  onEditStartChange: (value: string) => void;
  onEditEndChange: (value: string) => void;
  onEditTitleChange: (value: string) => void;
  onSave: () => void;
  onRemove?: () => void;
  onClose: () => void;
}

function MeetingFormModal({
  date,
  form,
  busy,
  editStart,
  editEnd,
  editTitle,
  editError,
  onEditStartChange,
  onEditEndChange,
  onEditTitleChange,
  onSave,
  onRemove,
  onClose,
}: MeetingFormModalProps) {
  const isAdd = form.mode === 'add';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={isAdd ? 'Add meeting' : 'Edit meeting'}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="hero-title" style={{ fontSize: '1.25rem' }}>
          {isAdd ? 'Add meeting' : 'Edit meeting'}
        </h2>
        <p className="hero-subtitle">
          {form.memberName} · {formatDisplayDate(date)}
        </p>
        {editError ? <div className="error-banner">{editError}</div> : null}
        <div className="meeting-edit-fields meeting-edit-fields-stack">
          <label>
            <span className="field-label">Title (optional)</span>
            <input
              className="date-input"
              type="text"
              value={editTitle}
              disabled={busy}
              placeholder="Meeting name"
              onChange={(event) => onEditTitleChange(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Start</span>
            <input
              className="date-input"
              type="time"
              value={editStart}
              disabled={busy}
              onChange={(event) => onEditStartChange(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">End</span>
            <input
              className="date-input"
              type="time"
              value={editEnd}
              disabled={busy}
              onChange={(event) => onEditEndChange(event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={onSave}
          >
            {isAdd ? 'Add' : 'Save'}
          </button>
          {!isAdd && onRemove ? (
            <button
              type="button"
              className="ghost-button danger-button"
              disabled={busy}
              onClick={onRemove}
            >
              Remove
            </button>
          ) : null}
          <button type="button" className="ghost-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function DayScheduleBoard({
  date,
  profile,
  schedule,
  householdUploads,
  timeSlots,
  memberIds,
  busy,
  showNowLine,
  nowLineFraction,
  onGenerate,
  onUploadStatus,
  onEditSlot,
  onUpdateBusySlots,
  renderSlotCell,
}: DayScheduleBoardProps) {
  const members = profile.household?.members ?? [];
  const metrics = workdayMetrics();
  const uploadedCount = new Set(
    householdUploads.filter((upload) => upload.date === date).map((upload) => upload.userId)
  ).size;
  const boardRef = useRef<HTMLDivElement>(null);
  const slotsStartRef = useRef<HTMLDivElement>(null);
  const slotsEndRef = useRef<HTMLDivElement>(null);
  const watchColumnRef = useRef<HTMLDivElement>(null);
  const meetingsTrackRef = useRef<HTMLDivElement>(null);
  const [trackHeight, setTrackHeight] = useState(0);
  const [meetingForm, setMeetingForm] = useState<MeetingFormState | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const canEditMeetings = Boolean(onUpdateBusySlots);
  const boardStyle = {
    '--member-count': members.length,
    '--slot-height': `${SLOT_HEIGHT_REM}rem`,
    '--slot-count': timeSlots.length,
  } as CSSProperties;

  useLayoutEffect(() => {
    const track = meetingsTrackRef.current;
    if (!track) {
      return;
    }

    function measure() {
      setTrackHeight(meetingsTrackRef.current?.clientHeight ?? 0);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [timeSlots.length]);

  function openMeetingEditor(
    memberUserId: string,
    memberName: string,
    slotIndex: number,
    busySlot: BusySlot
  ) {
    setMeetingForm({ mode: 'edit', memberUserId, memberName, slotIndex, busySlot });
    setEditStart(busySlot.start);
    setEditEnd(busySlot.end);
    setEditTitle(busySlot.title ?? '');
    setEditError(null);
  }

  function openAddMeeting(
    memberUserId: string,
    memberName: string,
    start: string,
    end: string
  ) {
    setMeetingForm({
      mode: 'add',
      memberUserId,
      memberName,
      slotIndex: -1,
      busySlot: { start, end },
    });
    setEditStart(start);
    setEditEnd(end);
    setEditTitle('');
    setEditError(null);
  }

  function closeMeetingForm() {
    setMeetingForm(null);
    setEditError(null);
  }

  function validateMeetingTimes(start: string, end: string): string | null {
    const parsedStart = parseWallClockTime(start);
    const parsedEnd = parseWallClockTime(end);
    if (!parsedStart || !parsedEnd) {
      return 'Enter valid start and end times.';
    }
    if (parsedStart >= parsedEnd) {
      return 'End time must be after start time.';
    }
    if (timeToMinutes(parsedEnd) - timeToMinutes(parsedStart) < MIN_MEETING_MINUTES) {
      return `Meetings must be at least ${MIN_MEETING_MINUTES} minutes.`;
    }
    return null;
  }

  function saveMeetingForm() {
    if (!meetingForm || !onUpdateBusySlots) {
      return;
    }

    const validationError = validateMeetingTimes(editStart, editEnd);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    const start = parseWallClockTime(editStart)!;
    const end = parseWallClockTime(editEnd)!;
    const title = editTitle.trim();
    const busySlots = getMemberBusySlots(meetingForm.memberUserId, date, householdUploads);
    const nextSlot: BusySlot = {
      ...meetingForm.busySlot,
      start,
      end,
      title: title || undefined,
    };

    const nextBusySlots =
      meetingForm.mode === 'add'
        ? sortBusySlots([...busySlots, nextSlot])
        : sortBusySlots(
            busySlots.map((slot, index) => (index === meetingForm.slotIndex ? nextSlot : slot))
          );

    onUpdateBusySlots(date, meetingForm.memberUserId, nextBusySlots);
    closeMeetingForm();
  }

  function removeMeeting() {
    if (!meetingForm || meetingForm.mode !== 'edit' || !onUpdateBusySlots) {
      return;
    }
    const busySlots = getMemberBusySlots(meetingForm.memberUserId, date, householdUploads);
    const nextBusySlots = busySlots.filter((_, index) => index !== meetingForm.slotIndex);
    onUpdateBusySlots(date, meetingForm.memberUserId, nextBusySlots);
    closeMeetingForm();
  }

  function handleTrackClick(
    event: React.MouseEvent<HTMLDivElement>,
    memberUserId: string,
    memberName: string
  ) {
    if (!canEditMeetings || busy) {
      return;
    }
    if ((event.target as Element).closest('.day-meeting-block')) {
      return;
    }

    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    if (rect.height <= 0) {
      return;
    }

    const fraction = (event.clientY - rect.top) / rect.height;
    const clickedMinutes = metrics.startMinutes + fraction * metrics.totalMinutes;
    const start = minutesToTime(snapMinutes(clickedMinutes));
    const end = defaultMeetingEnd(start, metrics);
    openAddMeeting(memberUserId, memberName, start, end);
  }

  return (
    <div className="day-board-wrapper" ref={boardRef}>
      <div
        className="day-board"
        data-testid="day-board"
        data-date={date}
        style={boardStyle}
      >
        <div className="day-board-header">
          <div className="day-corner" />
          <div className="day-watch-header">Watch</div>
          <div className="day-watch-divider" aria-hidden="true" />
          {members.map((member) => (
            <div className="day-member-header" key={member.userId}>
              <span
                className="member-avatar"
                style={{ background: memberColor(member.userId, memberIds) }}
              >
                {memberInitials(member.displayName)}
              </span>
              <span className="day-member-name">{member.displayName}</span>
            </div>
          ))}
        </div>

        <div className="day-board-actions">
          <div className="day-actions-label">{formatShortDate(date)}</div>
          <div className="day-watch-actions">
            <button
              type="button"
              data-testid={`generate-${date}`}
              className={schedule ? 'ghost-button generate-button' : 'primary-button generate-button'}
              disabled={busy}
              onClick={() => onGenerate(date)}
            >
              {schedule ? 'Regenerate' : 'Generate slots'}
            </button>
            <button
              type="button"
              data-testid={`upload-status-${date}`}
              className="upload-status-button"
              aria-label={`View upload status for ${formatDisplayDate(date)}`}
              onClick={() => onUploadStatus(date)}
            >
              {uploadedCount}/{memberIds.length} uploaded
            </button>
          </div>
          <div className="day-watch-divider" aria-hidden="true" />
          {members.map((member) => (
            <div className="day-member-action" key={member.userId}>
              {canEditMeetings ? (
                <button
                  type="button"
                  className="icon-button add-meeting-button"
                  data-testid={`add-meeting-${date}-${member.userId}`}
                  aria-label={`Add meeting for ${member.displayName}`}
                  disabled={busy}
                  onClick={() =>
                    openAddMeeting(
                      member.userId,
                      member.displayName,
                      WORKDAY_START,
                      defaultMeetingEnd(WORKDAY_START, metrics)
                    )
                  }
                >
                  +
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {timeSlots.map((timeSlot, rowIndex) => {
          const slot = schedule?.slots[rowIndex];

          return (
            <div className="day-board-slot-row" key={timeSlot.start}>
              <div
                className="day-time-label"
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
              <div
                className="day-watch-cell"
                ref={rowIndex === 0 ? watchColumnRef : undefined}
              >
                {slot
                  ? renderSlotCell({
                      date,
                      slot,
                      memberIds,
                      disabled: busy,
                      onClick: () => onEditSlot(date, slot),
                    })
                  : null}
              </div>
              <div className="day-watch-divider day-watch-divider-body" aria-hidden="true" />
              {rowIndex === 0
                ? members.map((member, memberIndex) => {
                    const busySlots = getMemberBusySlots(member.userId, date, householdUploads);
                    const accent = memberColor(member.userId, memberIds);

                    return (
                      <div
                        className="day-meetings-column"
                        key={member.userId}
                        style={{
                          gridRow: `3 / span ${timeSlots.length}`,
                          gridColumn: 4 + memberIndex,
                        }}
                      >
                        <div
                          ref={memberIndex === 0 ? meetingsTrackRef : undefined}
                          className={`day-meetings-track${canEditMeetings ? ' addable' : ''}`}
                          onClick={
                            canEditMeetings
                              ? (event) =>
                                  handleTrackClick(event, member.userId, member.displayName)
                              : undefined
                          }
                        >
                          {busySlots.map((busySlot, index) => (
                            <MeetingBlock
                              key={`${busySlot.start}-${busySlot.end}-${index}`}
                              busySlot={busySlot}
                              slotIndex={index}
                              memberUserId={member.userId}
                              accent={accent}
                              metrics={metrics}
                              trackHeight={trackHeight}
                              editable={canEditMeetings}
                              disabled={busy}
                              busySlots={busySlots}
                              onUpdateBusySlots={(nextBusySlots) =>
                                onUpdateBusySlots?.(date, member.userId, nextBusySlots)
                              }
                              onEdit={() =>
                                openMeetingEditor(member.userId, member.displayName, index, busySlot)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}
      </div>

      <DayNowLine
        visible={showNowLine}
        fraction={nowLineFraction}
        boardRef={boardRef}
        slotsStartRef={slotsStartRef}
        slotsEndRef={slotsEndRef}
        trackRef={watchColumnRef}
      />

      {meetingForm ? (
        <MeetingFormModal
          date={date}
          form={meetingForm}
          busy={busy}
          editStart={editStart}
          editEnd={editEnd}
          editTitle={editTitle}
          editError={editError}
          onEditStartChange={setEditStart}
          onEditEndChange={setEditEnd}
          onEditTitleChange={setEditTitle}
          onSave={saveMeetingForm}
          onRemove={meetingForm.mode === 'edit' ? removeMeeting : undefined}
          onClose={closeMeetingForm}
        />
      ) : null}
    </div>
  );
}
