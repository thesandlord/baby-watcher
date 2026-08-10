import { useState } from 'react';
import { todayIsoDate, type UserProfile } from '../lib/utils';
import { memberColor, memberInitials } from '../lib/members';
import type { UploadedAvailability } from '../lib/firestore-api';
import { ThemeToggle } from './ThemeToggle';

interface HouseholdMenuProps {
  profile: UserProfile;
  uploads: UploadedAvailability[];
  busy: boolean;
  open: boolean;
  canEditSchedule: boolean;
  onClose: () => void;
  onDeleteUpload: (date: string) => void;
  onCleanupOldUploads: () => void;
  onSelectUploadDate: (date: string) => void;
  onSignOut: () => void;
}

export function HouseholdMenu({
  profile,
  uploads,
  busy,
  open,
  canEditSchedule,
  onClose,
  onDeleteUpload,
  onCleanupOldUploads,
  onSelectUploadDate,
  onSignOut,
}: HouseholdMenuProps) {
  const memberIds = profile.household?.members.map((member) => member.userId) ?? [];
  const [copied, setCopied] = useState(false);
  const today = todayIsoDate();
  const pastUploadCount = uploads.filter((upload) => upload.date < today).length;

  if (!open) {
    return null;
  }

  async function copyInviteCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-sheet menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Household menu"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="menu-sheet-header">
          <h2 className="hero-title" style={{ fontSize: '1.25rem' }}>
            Profile
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="stack">
          <div>
            <span className="field-label">Signed in as</span>
            <strong>{profile.displayName}</strong>
            {profile.role === 'viewer' ? (
              <div className="role-badge role-badge-viewer">Viewer</div>
            ) : null}
            {profile.email ? <div className="muted-copy">{profile.email}</div> : null}
          </div>

          <div>
            <span className="field-label">Members</span>
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
                  {member.role === 'viewer' ? (
                    <span className="role-badge role-badge-viewer">Viewer</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>

          {profile.household?.inviteCode ? (
            <div className="invite-chip">
              <div>
                <span className="field-label">Invite code</span>
                <div className="invite-code" data-testid="invite-code">
                  {profile.household.inviteCode}
                </div>
              </div>
              <button
                type="button"
                className="copy-button"
                onClick={() => void copyInviteCode(profile.household!.inviteCode!)}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ) : null}

          {canEditSchedule ? (
            <div>
              <span className="field-label">My uploaded schedules</span>
              <div className="upload-list">
                {uploads.map((upload) => (
                  <details
                    key={upload.date}
                    className="upload-card"
                    data-testid={`upload-${upload.date}`}
                  >
                    <summary>
                      <span>
                        <strong>{upload.date}</strong>
                        <small>
                          {upload.busySlots.length} busy {upload.busySlots.length === 1 ? 'period' : 'periods'}
                        </small>
                      </span>
                      <span className="schedule-badge">{upload.confidence}</span>
                    </summary>
                    <div className="upload-periods">
                      {upload.busySlots.length > 0 ? upload.busySlots.map((slot, index) => (
                        <span key={`${slot.start}-${slot.end}-${index}`}>
                          {slot.start}–{slot.end}{slot.title ? ` · ${slot.title}` : ''}
                        </span>
                      )) : <span>No busy periods</span>}
                    </div>
                    <div className="upload-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        data-testid={`upload-view-${upload.date}`}
                        onClick={() => onSelectUploadDate(upload.date)}
                      >
                        View day
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger-button"
                        data-testid={`upload-delete-${upload.date}`}
                        disabled={busy}
                        onClick={() => onDeleteUpload(upload.date)}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                ))}
                {uploads.length === 0 ? (
                  <p className="muted-copy">No extracted schedules uploaded yet.</p>
                ) : null}
              </div>
              {pastUploadCount > 0 ? (
                <button
                  type="button"
                  className="secondary-button danger-button"
                  data-testid="cleanup-old-uploads"
                  disabled={busy}
                  onClick={onCleanupOldUploads}
                >
                  Clean up {pastUploadCount} past schedule{pastUploadCount === 1 ? '' : 's'}
                </button>
              ) : null}
            </div>
          ) : null}

          <ThemeToggle />

          <button type="button" className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
