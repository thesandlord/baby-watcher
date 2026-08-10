import { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import type { DaySchedule } from '@baby-watcher/shared';
import { auth, googleProvider } from './lib/firebase';
import {
  deleteMyAvailability,
  getProfile,
  getSchedule,
  regenerateSchedule,
  subscribeAvailabilityForDates,
  subscribeHouseholdMembers,
  subscribeMyAvailability,
  subscribeSchedulesForDates,
  swapScheduleAssignments,
  updateScheduleAssignment,
  type UploadedAvailability,
} from './lib/firestore-api';
import {
  mondayOfWeek,
  shiftWeek,
  todayIsoDate,
  weekdayDates,
  type UserProfile,
} from './lib/utils';
import { ThemeProvider } from './lib/theme';
import { LoginScreen } from './components/LoginScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ScheduleView } from './components/ScheduleView';
import { UploadMeetingsButton } from './components/UploadMeetingsButton';

function defaultWeekdayDate(): string {
  const today = todayIsoDate();
  const day = new Date(`${today}T12:00:00`).getDay();
  return day === 0 || day === 6 ? shiftWeek(mondayOfWeek(today), 1) : today;
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeDate, setActiveDate] = useState(defaultWeekdayDate);
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(defaultWeekdayDate()));
  const [schedules, setSchedules] = useState<Record<string, DaySchedule | null>>({});
  const [uploads, setUploads] = useState<UploadedAvailability[]>([]);
  const [householdUploads, setHouseholdUploads] = useState<UploadedAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weekDates = useMemo(() => weekdayDates(weekStart), [weekStart]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setSchedules({});
        setUploads([]);
        setHouseholdUploads([]);
        setLoading(false);
        return;
      }

      try {
        setProfile(await getProfile());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!profile?.household) {
      return;
    }

    setSchedules({});

    const householdId = profile.household.id;
    const handleSubscriptionError = (err: Error) => {
      setError(err.message);
    };

    const unsubscribeSchedules = subscribeSchedulesForDates(
      householdId,
      weekDates,
      setSchedules,
      handleSubscriptionError
    );
    const unsubscribeHouseholdUploads = subscribeAvailabilityForDates(
      householdId,
      weekDates,
      setHouseholdUploads,
      handleSubscriptionError
    );
    const unsubscribeMyUploads = subscribeMyAvailability(
      householdId,
      setUploads,
      handleSubscriptionError
    );
    const unsubscribeMembers = subscribeHouseholdMembers(
      householdId,
      (household) => {
        setProfile((current) => (current ? { ...current, household } : current));
      },
      handleSubscriptionError
    );

    return () => {
      unsubscribeSchedules();
      unsubscribeHouseholdUploads();
      unsubscribeMyUploads();
      unsubscribeMembers();
    };
  }, [profile?.household?.id, weekStart]);

  async function handleGenerate(date: string) {
    if (!profile?.household) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const existing = await getSchedule(profile.household.id, date);
      if (existing && !window.confirm('Regenerate this day? Existing slot changes will be replaced.')) {
        return;
      }
      await regenerateSchedule(profile.household.id, date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(date: string, start: string, watcherId: string | null) {
    if (!profile?.household || !schedules[date]) {
      return;
    }
    const watcher = profile.household.members.find((member) => member.userId === watcherId);
    setBusy(true);
    setError(null);
    try {
      await updateScheduleAssignment(
        profile.household.id,
        date,
        start,
        { watcherId, watcherName: watcher?.displayName ?? 'Unassigned' }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update slot.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSwap(
    sourceDate: string,
    sourceStart: string,
    targetDate: string,
    targetStart: string
  ) {
    if (!profile?.household || !schedules[sourceDate] || !schedules[targetDate]) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await swapScheduleAssignments(
        profile.household.id,
        { date: sourceDate, start: sourceStart },
        { date: targetDate, start: targetStart }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to swap slots.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUpload(date: string) {
    if (!profile?.household || !window.confirm(`Delete your extracted schedule for ${date}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMyAvailability(profile.household.id, date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete uploaded schedule.');
    } finally {
      setBusy(false);
    }
  }

  function selectDate(date: string) {
    setActiveDate(date);
    const monday = mondayOfWeek(date);
    if (monday !== weekStart) {
      setWeekStart(monday);
    }
  }

  function navigateWeek(weeks: number) {
    setWeekStart((current) => {
      const next = shiftWeek(current, weeks);
      setActiveDate(next);
      return next;
    });
  }

  async function refreshProfile() {
    const nextProfile = await getProfile();
    setProfile(nextProfile);
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="card loading-card">Loading...</div>
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
    <div className="app-shell" data-testid="app-shell" data-busy={busy}>
      <ScheduleView
        profile={profile}
        schedules={schedules}
        weekDates={weekDates}
        activeDate={activeDate}
        uploads={uploads}
        householdUploads={householdUploads}
        busy={busy}
        error={error}
        uploadMeetingsButton={(
          <UploadMeetingsButton
            profile={profile}
            selectedDate={activeDate}
            weekDates={weekDates}
          />
        )}
        onActiveDateChange={selectDate}
        onPreviousWeek={() => navigateWeek(-1)}
        onNextWeek={() => navigateWeek(1)}
        onToday={() => selectDate(defaultWeekdayDate())}
        onGenerate={(date) => void handleGenerate(date)}
        onSwap={(sourceDate, sourceStart, targetDate, targetStart) => {
          void handleSwap(sourceDate, sourceStart, targetDate, targetStart);
        }}
        onAssign={(date, start, watcherId) => void handleAssign(date, start, watcherId)}
        onDeleteUpload={(date) => void handleDeleteUpload(date)}
        onSignOut={() => void signOut(auth)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
