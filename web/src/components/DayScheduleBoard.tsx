import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  WORKDAY_END,
  WORKDAY_START,
  type BusySlot,
  type DaySchedule,
  type ScheduleSlot,
} from '@baby-watcher/shared';
import { memberColor, memberInitials } from '../lib/members';
import {
  formatDisplayDate,
  formatSlotTime,
  type UserProfile,
} from '../lib/utils';
import type { UploadedAvailability } from '../lib/firestore-api';

const SLOT_HEIGHT_REM = 3;

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
  renderSlotCell: (props: {
    date: string;
    slot: ScheduleSlot;
    memberIds: string[];
    disabled: boolean;
    onClick: () => void;
  }) => ReactNode;
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
  const trackRef = useRef<HTMLDivElement>(null);
  const boardHeight = `${timeSlots.length * SLOT_HEIGHT_REM}rem`;

  return (
    <div className="day-board-wrapper" ref={boardRef}>
      <div
        className="day-board"
        data-testid="day-board"
        data-date={date}
        style={{ '--member-count': members.length } as CSSProperties}
      >
        <div className="day-board-header">
          <div className="day-corner" />
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
          <div className="day-watch-divider" aria-hidden="true" />
          <div className="day-watch-header">Watch</div>
        </div>

        <div className="day-board-actions">
          <div className="day-actions-label">Day</div>
          {members.map((member) => (
            <div className="day-member-action-spacer" key={member.userId} aria-hidden="true" />
          ))}
          <div className="day-watch-divider" aria-hidden="true" />
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
        </div>

        <div className="day-board-body" ref={trackRef} style={{ minHeight: boardHeight }}>
          <div className="day-time-column">
            {timeSlots.map((timeSlot, rowIndex) => (
              <div
                className="day-time-label"
                key={timeSlot.start}
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
            ))}
          </div>

          {members.map((member) => {
            const busySlots = getMemberBusySlots(member.userId, date, householdUploads);
            const accent = memberColor(member.userId, memberIds);

            return (
              <div className="day-meetings-column" key={member.userId}>
                <div className="day-meetings-track" style={{ minHeight: boardHeight }}>
                  {busySlots.map((busySlot, index) => (
                    <div
                      key={`${busySlot.start}-${busySlot.end}-${index}`}
                      className="day-meeting-block"
                      style={{
                        ...meetingBlockStyle(busySlot, metrics),
                        '--meeting-accent': accent,
                      } as CSSProperties}
                      title={
                        busySlot.title
                          ? `${busySlot.start}–${busySlot.end} · ${busySlot.title}`
                          : `${busySlot.start}–${busySlot.end}`
                      }
                    >
                      <span className="day-meeting-time">
                        {formatSlotTime(busySlot.start)}–{formatSlotTime(busySlot.end)}
                      </span>
                      {busySlot.title ? (
                        <span className="day-meeting-title">{busySlot.title}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="day-watch-divider day-watch-divider-body" aria-hidden="true" />

          <div className="day-watch-column">
            {timeSlots.map((timeSlot, rowIndex) => {
              const slot = schedule?.slots[rowIndex];
              return (
                <div className="day-watch-cell" key={timeSlot.start}>
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
              );
            })}
          </div>
        </div>
      </div>

      <DayNowLine
        visible={showNowLine}
        fraction={nowLineFraction}
        boardRef={boardRef}
        slotsStartRef={slotsStartRef}
        slotsEndRef={slotsEndRef}
        trackRef={trackRef}
      />
    </div>
  );
}
