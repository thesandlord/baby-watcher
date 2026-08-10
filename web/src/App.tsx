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
  deleteMyAvailabilityBefore,
  getProfile,
  getSchedule,
  regenerateSchedule,
  subscribeAvailabilityForDates,
  subscribeHouseholdMembers,
  subscribeMyAvailability,
  subscribeSchedulesForDates,
  swapScheduleAssignments,
  updateScheduleAssignment,
  updateAvailabilityBusySlots,
  type UploadedAvailability,
} from './lib/firestore-api';
import {
  shiftWeekday,
  todayIsoDate,
  viewDatesFor,
  type ScheduleViewMode,
  type UserProfile,
} from './lib/utils';
import { weekdayIndexInAppTimezone } from './lib/timezone';
import { ThemeProvider } from './lib/theme';
import { LoginScreen } from './components/LoginScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ScheduleView } from './components/ScheduleView';
import { UploadMeetingsButton } from './components/UploadMeetingsButton';

function defaultActiveDate(): string {
  const today = todayIsoDate();
  const day = weekdayIndexInAppTimezone(today);
  if (day === 0) {
    return shiftWeekday(today, 1);
  }
  if (day === 6) {
    return shiftWeekday(today, -1);
  }
  return today;
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeDate, setActiveDate] = useState(defaultActiveDate);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('day');
  const [schedules, setSchedules] = useState<Record<string, DaySchedule | null>>({});
  const [uploads, setUploads] = useState<UploadedAvailability[]>([]);
  const [householdUploads, setHouseholdUploads] = useState<UploadedAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewDates = useMemo(() => viewDatesFor(activeDate, viewMode), [activeDate, viewMode]);
  const viewDatesKey = viewDates.join(',');

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
      viewDates,
      setSchedules,
      handleSubscriptionError
    );
    const unsubscribeHouseholdUploads = subscribeAvailabilityForDates(
      householdId,
      viewDates,
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
  }, [profile?.household?.id, viewDatesKey]);

  useEffect(() => {
    if (!profile?.household) {
      return;
    }

    void deleteMyAvailabilityBefore(profile.household.id, todayIsoDate()).catch((err) => {
      console.error('Failed to clean up old availability:', err);
    });
  }, [profile?.household?.id]);

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

  async function handleUpdateBusySlots(date: string, busySlots: UploadedAvailability['busySlots']) {
    if (!profile?.household) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAvailabilityBusySlots(profile.household.id, date, busySlots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update meeting times.');
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

  async function handleCleanupOldUploads() {
    if (!profile?.household) {
      return;
    }
    const today = todayIsoDate();
    const oldCount = uploads.filter((upload) => upload.date < today).length;
    if (
      oldCount === 0 ||
      !window.confirm(`Delete ${oldCount} uploaded schedule${oldCount === 1 ? '' : 's'} from before today?`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMyAvailabilityBefore(profile.household.id, today);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clean up old schedules.');
    } finally {
      setBusy(false);
    }
  }

  function selectDate(date: string) {
    setActiveDate(date);
  }

  function navigatePeriod(direction: -1 | 1) {
    const step = viewMode === 'day' ? 1 : 3;
    setActiveDate((current) => shiftWeekday(current, direction * step));
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
        viewDates={viewDates}
        activeDate={activeDate}
        viewMode={viewMode}
        uploads={uploads}
        householdUploads={householdUploads}
        busy={busy}
        error={error}
        uploadMeetingsButton={(
          <UploadMeetingsButton
            profile={profile}
            selectedDate={activeDate}
            viewDates={viewDates}
          />
        )}
        onActiveDateChange={selectDate}
        onViewModeChange={setViewMode}
        onPreviousPeriod={() => navigatePeriod(-1)}
        onNextPeriod={() => navigatePeriod(1)}
        onToday={() => selectDate(defaultActiveDate())}
        onGenerate={(date) => void handleGenerate(date)}
        onSwap={(sourceDate, sourceStart, targetDate, targetStart) => {
          void handleSwap(sourceDate, sourceStart, targetDate, targetStart);
        }}
        onAssign={(date, start, watcherId) => void handleAssign(date, start, watcherId)}
        onUpdateBusySlots={(date, busySlots) => void handleUpdateBusySlots(date, busySlots)}
        onDeleteUpload={(date) => void handleDeleteUpload(date)}
        onCleanupOldUploads={() => void handleCleanupOldUploads()}
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
