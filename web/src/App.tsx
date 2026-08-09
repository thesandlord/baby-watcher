import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import type { DaySchedule } from '@baby-watcher/shared';
import { auth, googleProvider, getProfile, getSchedule, regenerateSchedule } from './lib/firebase';
import { todayIsoDate, type UserProfile } from './lib/utils';
import { LoginScreen } from './components/LoginScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ScheduleView } from './components/ScheduleView';
import { FloatingCameraButton } from './components/FloatingCameraButton';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setSchedule(null);
        setLoading(false);
        return;
      }

      try {
        const response = await getProfile();
        setProfile((response.data as { profile: UserProfile | null }).profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user || !profile?.household) {
      return;
    }

    void loadSchedule(selectedDate);
  }, [user, profile?.household?.id, selectedDate]);

  async function loadSchedule(date: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await getSchedule({ date });
      setSchedule((response.data as { schedule: DaySchedule }).schedule);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    setBusy(true);
    setError(null);
    try {
      const response = await regenerateSchedule({ date: selectedDate });
      setSchedule((response.data as { schedule: DaySchedule }).schedule);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate schedule.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshProfile() {
    const response = await getProfile();
    setProfile((response.data as { profile: UserProfile | null }).profile);
    await loadSchedule(selectedDate);
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="card">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onGoogleSignIn={() => signInWithPopup(auth, googleProvider)}
        onEmailSignIn={(email, password) => signInWithEmailAndPassword(auth, email, password)}
        onEmailSignUp={(email, password) => createUserWithEmailAndPassword(auth, email, password)}
      />
    );
  }

  if (!profile?.household) {
    return <OnboardingScreen onComplete={refreshProfile} />;
  }

  return (
    <div className="app-shell">
      <ScheduleView
        profile={profile}
        schedule={schedule}
        selectedDate={selectedDate}
        busy={busy}
        error={error}
        onDateChange={setSelectedDate}
        onRegenerate={() => void handleRegenerate()}
        onSignOut={() => void signOut(auth)}
      />

      <FloatingCameraButton
        selectedDate={selectedDate}
        onUploaded={refreshProfile}
        onError={setError}
      />
    </div>
  );
}
