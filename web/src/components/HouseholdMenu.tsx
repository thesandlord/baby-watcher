import { useState } from 'react';
import type { UserProfile } from '../lib/utils';
import { memberColor, memberInitials } from '../lib/members';
import { ThemeToggle } from './ThemeToggle';

interface HouseholdMenuProps {
  profile: UserProfile;
  busy: boolean;
  open: boolean;
  onClose: () => void;
  onRegenerate: () => void;
  onSignOut: () => void;
}

export function HouseholdMenu({
  profile,
  busy,
  open,
  onClose,
  onRegenerate,
  onSignOut,
}: HouseholdMenuProps) {
  const memberIds = profile.household?.members.map((member) => member.userId) ?? [];
  const [copied, setCopied] = useState(false);

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
            Household
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="stack">
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
              <button
                type="button"
                className="copy-button"
                onClick={() => void copyInviteCode(profile.household!.inviteCode!)}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
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

          <ThemeToggle />

          <button type="button" className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
