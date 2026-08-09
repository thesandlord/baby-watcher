import { useState } from 'react';
import { createHousehold, joinHousehold } from '../lib/firestore-api';
import { ThemeToggle } from './ThemeToggle';

interface OnboardingScreenProps {
  onComplete: () => Promise<void>;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createHousehold(displayName);
      setCreatedInviteCode(result.inviteCode ?? null);
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create household.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinHousehold(displayName, inviteCode);
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join household.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <span className="brand-mark" aria-hidden="true">
          👶
        </span>
        <ThemeToggle compact />
      </div>

      <div className="card stack">
        <div>
          <h1 className="hero-title">Set up your household</h1>
          <p className="hero-subtitle">
            Create a shared group for family members who rotate baby-watching duty.
          </p>
        </div>

        {createdInviteCode ? (
          <div className="success-banner">
            Household created. Share invite code <strong>{createdInviteCode}</strong> with your
            family.
          </div>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="mode-switch">
          <button
            type="button"
            className={mode === 'create' ? 'active' : undefined}
            onClick={() => setMode('create')}
          >
            Create
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'active' : undefined}
            onClick={() => setMode('join')}
          >
            Join
          </button>
        </div>

        {mode === 'create' ? (
          <form className="stack" onSubmit={(event) => void handleCreate(event)}>
            <label>
              <span className="field-label">Your name</span>
              <input
                className="text-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Alice"
                required
              />
            </label>
            <button type="submit" className="primary-button" disabled={busy}>
              Create household
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={(event) => void handleJoin(event)}>
            <label>
              <span className="field-label">Your name</span>
              <input
                className="text-input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Bob"
                required
              />
            </label>
            <label>
              <span className="field-label">Invite code</span>
              <input
                className="text-input"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                required
              />
            </label>
            <button type="submit" className="primary-button" disabled={busy}>
              Join household
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
