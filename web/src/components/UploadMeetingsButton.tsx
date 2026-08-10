import { useRef, useState } from 'react';
import { extractCalendarFromImage } from '../lib/openrouter';
import { saveAvailability } from '../lib/firestore-api';
import { fileToBase64, type UserProfile } from '../lib/utils';

const mockMode = import.meta.env.VITE_MOCK_CALENDAR_EXTRACTION === 'true';

interface UploadMeetingsButtonProps {
  profile: UserProfile;
  selectedDate: string;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}

export function UploadMeetingsButton({
  profile,
  selectedDate,
  onUploaded,
  onError,
}: UploadMeetingsButtonProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualDate, setManualDate] = useState(selectedDate);
  const [needsDateConfirmation, setNeedsDateConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  function resetModal() {
    setOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setNeedsDateConfirmation(false);
    setManualDate(selectedDate);
  }

  function openUploadModal() {
    setOpen(true);
    setManualDate(selectedDate);
    setNeedsDateConfirmation(false);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    event.target.value = '';
  }

  async function processUpload(dateOverride?: string) {
    if (!profile.household || (!mockMode && !selectedFile)) return;
    setBusy(true);
    onError(null);
    try {
      const imageBase64 = selectedFile ? await fileToBase64(selectedFile) : 'mock-calendar-image';
      const extraction = await extractCalendarFromImage(
        imageBase64,
        selectedFile?.type || 'image/jpeg',
        dateOverride
      );
      if (extraction.needsDateConfirmation && !dateOverride) {
        setNeedsDateConfirmation(true);
        return;
      }
      const date = extraction.date ?? dateOverride;
      if (!date) throw new Error('Could not determine the calendar date. Please provide one.');
      await saveAvailability(
        profile.household.id,
        date,
        profile.displayName,
        extraction.busySlots,
        extraction.confidence
      );
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
        <div className="modal-backdrop" role="presentation" onClick={resetModal}>
          <div
            className="modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Upload calendar screenshot"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="hero-title" style={{ fontSize: '1.25rem' }}>
              Upload calendar screenshot
            </h2>
            <p className="hero-subtitle">
              We&apos;ll save your busy times. Generate that day when you&apos;re ready.
            </p>
            {mockMode && !previewUrl ? (
              <div className="info-banner">
                Local mock mode: sample busy slots will be used for this upload.
              </div>
            ) : null}
            {previewUrl ? (
              <img src={previewUrl} alt="Calendar preview" className="preview-image" />
            ) : null}
            {!selectedFile ? (
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
                {mockMode ? (
                  <button
                    type="button"
                    className="secondary-button sample-calendar-button"
                    disabled={busy}
                    onClick={() => void processUpload(selectedDate)}
                  >
                    {busy ? 'Uploading...' : 'Use sample calendar'}
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={resetModal}>
                  Cancel
                </button>
              </div>
            ) : needsDateConfirmation ? (
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
                  onClick={() => void processUpload(manualDate)}
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
                  onClick={() => void processUpload(selectedDate)}
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
