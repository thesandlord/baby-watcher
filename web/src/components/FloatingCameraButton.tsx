import { useRef, useState } from 'react';
import type { DaySchedule } from '@baby-watcher/shared';
import { uploadCalendar } from '../lib/firebase';
import { fileToBase64, isDaySchedule } from '../lib/utils';

interface FloatingCameraButtonProps {
  selectedDate: string;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}

export function FloatingCameraButton({
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
    if (!selectedFile) {
      return;
    }

    setBusy(true);
    onError(null);

    try {
      const imageBase64 = await fileToBase64(selectedFile);
      const response = await uploadCalendar({
        imageBase64,
        mimeType: selectedFile.type || 'image/jpeg',
        date: dateOverride,
      });

      const data = response.data as {
        needsDateConfirmation?: boolean;
        schedule?: DaySchedule;
      };

      if (data.needsDateConfirmation) {
        setNeedsDateConfirmation(true);
        return;
      }

      if (isDaySchedule(data.schedule)) {
        await onUploaded();
        resetModal();
      }
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
