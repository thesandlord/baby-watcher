import { useRef, useState } from 'react';
import type { CalendarExtractionResult } from '@baby-watcher/shared';
import { extractCalendarFromImage } from '../lib/openrouter';
import { saveAvailability, saveAvailabilityBatch } from '../lib/firestore-api';
import { fileToBase64, shiftDate, type UserProfile } from '../lib/utils';

const mockMode = import.meta.env.VITE_MOCK_CALENDAR_EXTRACTION === 'true';

type ProcessingPhase = 'idle' | 'reading' | 'saving' | 'success';

interface UploadMeetingsButtonProps {
  profile: UserProfile;
  selectedDate: string;
  viewDates: string[];
}

export function UploadMeetingsButton({
  profile,
  selectedDate,
  viewDates,
}: UploadMeetingsButtonProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualDate, setManualDate] = useState(selectedDate);
  const [manualWeekStart, setManualWeekStart] = useState(viewDates[0] ?? selectedDate);
  const [needsDateConfirmation, setNeedsDateConfirmation] = useState(false);
  const [needsWeekConfirmation, setNeedsWeekConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('idle');
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingExtraction, setPendingExtraction] = useState<CalendarExtractionResult | null>(null);

  function resetModal() {
    setOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setNeedsDateConfirmation(false);
    setNeedsWeekConfirmation(false);
    setManualDate(selectedDate);
    setManualWeekStart(viewDates[0] ?? selectedDate);
    setSubmitting(false);
    setProcessingPhase('idle');
    setModalError(null);
    setSuccessMessage(null);
    setPendingExtraction(null);
  }

  function openUploadModal() {
    setOpen(true);
    setManualDate(selectedDate);
    setManualWeekStart(viewDates[0] ?? selectedDate);
    setNeedsDateConfirmation(false);
    setNeedsWeekConfirmation(false);
    setModalError(null);
    setSuccessMessage(null);
    setPendingExtraction(null);
    setProcessingPhase('idle');
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setModalError(null);
    setSuccessMessage(null);
    event.target.value = '';
  }

  async function persistExtraction(
    extraction: CalendarExtractionResult,
    householdId: string,
    displayName: string
  ) {
    if (extraction.isWeekView) {
      const days = extraction.days ?? [];
      if (days.length === 0) {
        throw new Error('No days were extracted from this week view. Try another photo.');
      }
      setProcessingPhase('saving');
      await saveAvailabilityBatch(
        householdId,
        displayName,
        days.map((day) => ({
          date: day.date,
          busySlots: day.busySlots,
          confidence: day.confidence,
        }))
      );
      setProcessingPhase('success');
      setSuccessMessage(`Saved availability for ${days.length} day${days.length === 1 ? '' : 's'}.`);
      window.setTimeout(resetModal, 1400);
      return;
    }

    const date = extraction.date;
    if (!date) {
      throw new Error('Could not determine the calendar date. Please provide one.');
    }
    setProcessingPhase('saving');
    await saveAvailability(
      householdId,
      date,
      displayName,
      extraction.busySlots,
      extraction.confidence
    );
    setProcessingPhase('success');
    setSuccessMessage(`Saved availability for ${date}.`);
    window.setTimeout(resetModal, 1200);
  }

  async function processUpload(options?: { dateOverride?: string; weekStartOverride?: string }) {
    if (submitting || !profile.household || (!mockMode && !selectedFile && !pendingExtraction)) {
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setSuccessMessage(null);
    setProcessingPhase('reading');

    const householdId = profile.household.id;
    const displayName = profile.displayName;

    try {
      let extraction = pendingExtraction;

      if (!extraction) {
        const file = selectedFile;
        const imageBase64 = file ? await fileToBase64(file) : 'mock-calendar-image';
        const mimeType = file?.type || 'image/jpeg';
        extraction = await extractCalendarFromImage(imageBase64, mimeType, {
          hintedDate: options?.dateOverride ?? selectedDate,
          weekDates: options?.dateOverride ? undefined : viewDates,
        });
      }

      if (extraction.isWeekView) {
        if (extraction.needsDateConfirmation && !options?.weekStartOverride) {
          setPendingExtraction(extraction);
          setNeedsWeekConfirmation(true);
          setManualWeekStart(extraction.weekStart ?? viewDates[0] ?? selectedDate);
          setProcessingPhase('idle');
          return;
        }

        if (options?.weekStartOverride && extraction.days?.length) {
          extraction = alignWeekDays(extraction, options.weekStartOverride);
        }
      } else if (extraction.needsDateConfirmation && !options?.dateOverride) {
        setPendingExtraction(extraction);
        setNeedsDateConfirmation(true);
        setManualDate(selectedDate);
        setProcessingPhase('idle');
        return;
      }

      if (!extraction.isWeekView && options?.dateOverride) {
        extraction = { ...extraction, date: options.dateOverride, needsDateConfirmation: false };
      }

      await persistExtraction(extraction, householdId, displayName);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Upload failed.');
      setProcessingPhase('idle');
    } finally {
      setSubmitting(false);
    }
  }

  const isProcessing = processingPhase === 'reading' || processingPhase === 'saving';
  const processingLabel =
    processingPhase === 'reading'
      ? 'Reading your calendar...'
      : processingPhase === 'saving'
        ? 'Saving availability...'
        : null;

  return (
    <>
      <button
        type="button"
        className="icon-button upload-meetings-button"
        aria-label="Upload meetings"
        onClick={openUploadModal}
      >
        +
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFileChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileChange}
      />
      {open ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={isProcessing ? undefined : resetModal}
        >
          <div
            className="modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Upload calendar screenshot"
            aria-busy={isProcessing}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="hero-title" style={{ fontSize: '1.25rem' }}>
              Upload calendar screenshot
            </h2>
            <p className="hero-subtitle">
              Snap a single day or your whole week — we&apos;ll extract busy times for each day.
            </p>
            {mockMode && !previewUrl ? (
              <div className="info-banner">
                Local mock mode: sample busy slots will be used for this upload.
              </div>
            ) : null}
            {modalError ? <div className="error-banner">{modalError}</div> : null}
            {successMessage ? <div className="success-banner">{successMessage}</div> : null}
            {isProcessing ? (
              <div className="processing-panel" role="status" aria-live="polite">
                <span className="processing-spinner" aria-hidden="true" />
                <span>{processingLabel}</span>
              </div>
            ) : null}
            {previewUrl ? (
              <div className="preview-viewbox">
                <img src={previewUrl} alt="Calendar preview" className="preview-image" />
              </div>
            ) : null}
            {!selectedFile && !mockMode && !isProcessing && processingPhase !== 'success' ? (
              <div className="upload-source-options">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  Take a photo
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => imageInputRef.current?.click()}
                >
                  Upload an image
                </button>
                <button type="button" className="ghost-button" onClick={resetModal}>
                  Cancel
                </button>
              </div>
            ) : null}
            {!selectedFile && mockMode && !isProcessing && processingPhase !== 'success' ? (
              <div className="upload-source-options">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  Take a photo
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => imageInputRef.current?.click()}
                >
                  Upload an image
                </button>
                <button
                  type="button"
                  className="secondary-button sample-calendar-button"
                  disabled={submitting}
                  onClick={() => void processUpload({ dateOverride: selectedDate })}
                >
                  Use sample day
                </button>
                <button
                  type="button"
                  className="secondary-button sample-calendar-button"
                  disabled={submitting}
                  onClick={() => void processUpload()}
                >
                  Use sample week
                </button>
                <button type="button" className="ghost-button" onClick={resetModal}>
                  Cancel
                </button>
              </div>
            ) : null}
            {selectedFile && needsWeekConfirmation && !isProcessing && processingPhase !== 'success' ? (
              <div className="stack" style={{ marginTop: '1rem' }}>
                <label>
                  <span className="field-label">Which week does this calendar show?</span>
                  <input
                    className="date-input"
                    type="date"
                    value={manualWeekStart}
                    onChange={(event) => setManualWeekStart(event.target.value)}
                  />
                </label>
                {pendingExtraction?.days?.length ? (
                  <p className="muted-copy">
                    Found busy times for {pendingExtraction.days.length} day
                    {pendingExtraction.days.length === 1 ? '' : 's'}.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="primary-button"
                  disabled={submitting}
                  onClick={() => void processUpload({ weekStartOverride: manualWeekStart })}
                >
                  Confirm week and upload
                </button>
              </div>
            ) : null}
            {selectedFile && needsDateConfirmation && !needsWeekConfirmation && !isProcessing && processingPhase !== 'success' ? (
              <div className="stack" style={{ marginTop: '1rem' }}>
                <label>
                  <span className="field-label">Which day is this calendar for?</span>
                  <input
                    className="date-input"
                    type="date"
                    value={manualDate}
                    onChange={(event) => setManualDate(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={submitting}
                  onClick={() => void processUpload({ dateOverride: manualDate })}
                >
                  Confirm day and upload
                </button>
              </div>
            ) : null}
            {selectedFile &&
            !needsDateConfirmation &&
            !needsWeekConfirmation &&
            !isProcessing &&
            processingPhase !== 'success' ? (
              <div className="modal-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={submitting}
                  onClick={() => void processUpload({ dateOverride: selectedDate })}
                >
                  Upload for selected day
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={submitting}
                  onClick={() => void processUpload()}
                >
                  Upload and auto-detect days
                </button>
                <button type="button" className="ghost-button" onClick={resetModal} disabled={submitting}>
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function alignWeekDays(
  extraction: CalendarExtractionResult,
  weekStart: string
): CalendarExtractionResult {
  const days = extraction.days ?? [];
  if (days.length === 0) {
    return { ...extraction, weekStart, needsDateConfirmation: false };
  }

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sorted[0]?.date;
  if (!firstDate) {
    return { ...extraction, weekStart, needsDateConfirmation: false };
  }

  const offsetDays = calendarDaysBetween(firstDate, weekStart);

  return {
    ...extraction,
    weekStart,
    needsDateConfirmation: false,
    days: sorted.map((day) => ({
      ...day,
      date: shiftDate(day.date, offsetDays),
    })),
  };
}

function calendarDaysBetween(from: string, to: string): number {
  if (from === to) {
    return 0;
  }
  const direction = from < to ? 1 : -1;
  let current = from;
  let offset = 0;
  while (current !== to && Math.abs(offset) < 366) {
    current = shiftDate(current, direction);
    offset += direction;
  }
  return offset;
}
