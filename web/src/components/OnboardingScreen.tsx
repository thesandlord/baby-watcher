import { useState } from 'react';
import { createHousehold, joinHousehold } from '../lib/firebase';

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

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await createHousehold({ displayName });
      const data = response.data as { inviteCode?: string };
      setCreatedInviteCode(data.inviteCode ?? null);
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create household.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinHousehold({ displayName, inviteCode });
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join household.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
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

        <div className="stack">
          <button
            type="button"
            className={mode === 'create' ? 'primary-button' : 'secondary-button'}
            onClick={() => setMode('create')}
          >
            Create household
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'primary-button' : 'secondary-button'}
            onClick={() => setMode('join')}
          >
            Join with invite code
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
