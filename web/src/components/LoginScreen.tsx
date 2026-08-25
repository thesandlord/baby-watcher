import { useState, type SubmitEvent } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface LoginScreenProps {
  onGoogleSignIn: () => Promise<unknown>;
  onEmailSignIn: (email: string, password: string) => Promise<unknown>;
  onEmailSignUp: (email: string, password: string) => Promise<unknown>;
}

export function LoginScreen({
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'sign-in') {
        await onEmailSignIn(email, password);
      } else {
        await onEmailSignUp(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell app-shell">
      <div className="top-bar">
        <span className="brand-mark" aria-hidden="true">
          👶
        </span>
        <ThemeToggle compact />
      </div>

      <div className="card auth-card stack">
        <div>
          <h1 className="hero-title">Baby Watcher</h1>
          <p className="hero-subtitle">
            Share calendar screenshots and get a fair 8am–5pm baby-watching schedule.
          </p>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void onGoogleSignIn()
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Google sign-in failed.');
              })
              .finally(() => setBusy(false));
          }}
        >
          Continue with Google
        </button>

        <div className="divider">or use email</div>

        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span className="field-label">Email</span>
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            <span className="field-label">Password</span>
            <input
              className="text-input"
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          <button type="submit" className="primary-button" disabled={busy}>
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="ghost-button"
          onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        >
          {mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
