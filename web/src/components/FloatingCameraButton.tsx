import { useRef, useState } from 'react';
import { extractCalendarFromImage } from '../lib/openrouter';
import {
  regenerateSchedule,
  saveAvailability,
} from '../lib/firestore-api';
import { fileToBase64, type UserProfile } from '../lib/utils';

interface FloatingCameraButtonProps {
  profile: UserProfile;
  selectedDate: string;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}

export function FloatingCameraButton({
  profile,
  selectedDate,
  onUploaded,
  onError,
}: FloatingCameraButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualDate, setManualDate] = useState(selectedDate);
  const [needsDateConfirmation, setNeedsDateConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  function resetModal() {
    setOpen(false);
    setPreviewUrl(null);
    setSelectedFile(null);
    setNeedsDateConfirmation(false);
    setManualDate(selectedDate);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setOpen(true);
    setManualDate(selectedDate);
    setNeedsDateConfirmation(false);
    event.target.value = '';
  }

  async function submitUpload(dateOverride?: string) {
    if (!selectedFile || !profile.household) {
      return;
    }

    setBusy(true);
    onError(null);

    try {
      const imageBase64 = await fileToBase64(selectedFile);
      const extraction = await extractCalendarFromImage(
        imageBase64,
        selectedFile.type || 'image/jpeg',
        dateOverride
      );

      if (extraction.needsDateConfirmation && !dateOverride) {
        setNeedsDateConfirmation(true);
        return;
      }

      const date = extraction.date ?? dateOverride;
      if (!date) {
        throw new Error('Could not determine the calendar date. Please provide one.');
      }

      await saveAvailability(
        profile.household.id,
        date,
        profile.displayName,
        extraction.busySlots,
        extraction.confidence
      );

      await regenerateSchedule(profile.household.id, date);
      await onUploaded();
      resetModal();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="floating-camera"
        aria-label="Upload calendar photo"
        onClick={() => inputRef.current?.click()}
      >
        📷
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFileChange}
      />

      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={resetModal}>
          <div
            className="modal-sheet"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="hero-title" style={{ fontSize: '1.25rem' }}>
              Upload calendar screenshot
            </h2>
            <p className="hero-subtitle">
              We&apos;ll read your busy times and regenerate the baby-watching schedule.
            </p>

            {previewUrl ? (
              <img src={previewUrl} alt="Calendar preview" className="preview-image" />
            ) : null}

            {needsDateConfirmation ? (
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
                  disabled={busy}
                  onClick={() => void submitUpload(manualDate)}
                >
                  {busy ? 'Uploading...' : 'Confirm day and upload'}
                </button>
              </div>
            ) : (
              <div className="modal-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void submitUpload(selectedDate)}
                >
                  {busy ? 'Uploading...' : 'Upload for selected day'}
                </button>
                <button type="button" className="ghost-button" onClick={resetModal}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
