import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  arrayUnion,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  generateSchedule,
  hashScheduleInput,
  type DaySchedule,
  type PersonAvailability,
  type ScheduleSlot,
} from '@baby-watcher/shared';
import { auth, db } from './firebase';
import type { UserProfile } from './utils';

export interface UploadedAvailability {
  date: string;
  userId: string;
  displayName: string;
  busySlots: PersonAvailability['busySlots'];
  confidence: string;
  updatedAt: Date | null;
}

function parseAvailabilityDoc(
  availabilityDoc: { data: () => Record<string, unknown> }
): UploadedAvailability {
  const data = availabilityDoc.data();
  const timestamp = data.updatedAt as { toDate?: () => Date } | undefined;
  return {
    date: data.date as string,
    userId: data.userId as string,
    displayName: data.displayName as string,
    busySlots: (data.busySlots ?? []) as PersonAvailability['busySlots'],
    confidence: (data.confidence as string) ?? 'unknown',
    updatedAt: timestamp?.toDate?.() ?? null,
  };
}

function requireUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in required.');
  }
  return uid;
}

async function getHouseholdMembers(householdId: string) {
  const snapshot = await getDocs(
    query(collection(db, 'users'), where('householdId', '==', householdId))
  );

  return snapshot.docs.map((memberDoc) => ({
    userId: memberDoc.id,
    displayName: (memberDoc.data().displayName as string) ?? memberDoc.id,
  }));
}

async function getAvailabilityForDay(
  householdId: string,
  date: string
): Promise<PersonAvailability[]> {
  const members = await getHouseholdMembers(householdId);
  const availability = await Promise.all(
    members.map(async (member) => {
      const availabilityDoc = await getDoc(
        doc(db, 'households', householdId, 'availability', `${date}_${member.userId}`)
      );

      return {
        userId: member.userId,
        displayName: member.displayName,
        busySlots: availabilityDoc.exists() ? availabilityDoc.data().busySlots ?? [] : [],
      };
    })
  );

  return availability;
}

export async function getProfile(): Promise<UserProfile | null> {
  const uid = requireUserId();
  const profileDoc = await getDoc(doc(db, 'users', uid));
  if (!profileDoc.exists()) {
    return null;
  }

  const profile = profileDoc.data();
  let household = null;

  if (profile.householdId) {
    const members = await getHouseholdMembers(profile.householdId);
    const householdDoc = await getDoc(doc(db, 'households', profile.householdId));
    household = {
      id: profile.householdId,
      inviteCode: (householdDoc.data()?.inviteCode as string | null) ?? null,
      members,
    };
  }

  return {
    uid,
    displayName: profile.displayName as string,
    email: (profile.email as string | null) ?? auth.currentUser?.email ?? null,
    household,
  };
}

export async function createHousehold(displayName: string) {
  const uid = requireUserId();
  const existing = await getDoc(doc(db, 'users', uid));
  if (existing.exists() && existing.data().householdId) {
    const householdDoc = await getDoc(doc(db, 'households', existing.data().householdId));
    return {
      householdId: existing.data().householdId as string,
      inviteCode: (householdDoc.data()?.inviteCode as string | null) ?? null,
    };
  }

  const householdRef = doc(collection(db, 'households'));
  const inviteCode = householdRef.id.slice(0, 6).toUpperCase();
  const batch = writeBatch(db);

  batch.set(householdRef, {
    createdAt: serverTimestamp(),
    createdBy: uid,
    inviteCode,
    memberIds: [uid],
  });

  batch.set(
    doc(db, 'users', uid),
    {
      displayName,
      householdId: householdRef.id,
      email: auth.currentUser?.email ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
  return { householdId: householdRef.id, inviteCode };
}

export async function joinHousehold(displayName: string, inviteCode: string) {
  const uid = requireUserId();
  const normalizedCode = inviteCode.trim().toUpperCase();
  const householdQuery = await getDocs(
    query(collection(db, 'households'), where('inviteCode', '==', normalizedCode))
  );

  if (householdQuery.empty) {
    throw new Error('Household not found.');
  }

  const householdDoc = householdQuery.docs[0];
  const batch = writeBatch(db);

  batch.update(householdDoc.ref, {
    memberIds: arrayUnion(uid),
  });

  batch.set(
    doc(db, 'users', uid),
    {
      displayName,
      householdId: householdDoc.id,
      email: auth.currentUser?.email ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
  return { householdId: householdDoc.id };
}

export async function saveAvailability(
  householdId: string,
  date: string,
  displayName: string,
  busySlots: PersonAvailability['busySlots'],
  confidence: string
) {
  const uid = requireUserId();

  await setDoc(doc(db, 'households', householdId, 'availability', `${date}_${uid}`), {
    date,
    userId: uid,
    displayName,
    busySlots,
    confidence,
    updatedAt: serverTimestamp(),
  });
}

export async function saveAvailabilityBatch(
  householdId: string,
  displayName: string,
  days: Array<{
    date: string;
    busySlots: PersonAvailability['busySlots'];
    confidence: string;
  }>
) {
  if (days.length === 0) {
    return;
  }

  const uid = requireUserId();
  const batch = writeBatch(db);

  for (const day of days) {
    batch.set(doc(db, 'households', householdId, 'availability', `${day.date}_${uid}`), {
      date: day.date,
      userId: uid,
      displayName,
      busySlots: day.busySlots,
      confidence: day.confidence,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function upsertMemberAvailabilityBusySlots(
  householdId: string,
  date: string,
  userId: string,
  displayName: string,
  busySlots: PersonAvailability['busySlots']
) {
  const availabilityRef = doc(db, 'households', householdId, 'availability', `${date}_${userId}`);
  const availabilityDoc = await getDoc(availabilityRef);

  if (availabilityDoc.exists()) {
    await setDoc(
      availabilityRef,
      {
        busySlots,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  await setDoc(availabilityRef, {
    date,
    userId,
    displayName,
    busySlots,
    confidence: 'manual',
    updatedAt: serverTimestamp(),
  });
}

export async function listMyAvailability(
  householdId: string
): Promise<UploadedAvailability[]> {
  const uid = requireUserId();
  const snapshot = await getDocs(
    query(
      collection(db, 'households', householdId, 'availability'),
      where('userId', '==', uid)
    )
  );

  return snapshot.docs
    .map((availabilityDoc) => parseAvailabilityDoc(availabilityDoc))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function listAvailabilityForDates(
  householdId: string,
  dates: string[]
): Promise<UploadedAvailability[]> {
  if (dates.length === 0) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(db, 'households', householdId, 'availability'),
      where('date', 'in', dates)
    )
  );

  return snapshot.docs.map((availabilityDoc) => parseAvailabilityDoc(availabilityDoc));
}

export function subscribeSchedulesForDates(
  householdId: string,
  dates: string[],
  onChange: (schedules: Record<string, DaySchedule | null>) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (dates.length === 0) {
    onChange({});
    return () => {};
  }

  return onSnapshot(
    query(
      collection(db, 'households', householdId, 'schedules'),
      where('date', 'in', dates)
    ),
    (snapshot) => {
      const schedules = Object.fromEntries(dates.map((date) => [date, null])) as Record<
        string,
        DaySchedule | null
      >;
      for (const scheduleDoc of snapshot.docs) {
        const schedule = scheduleDoc.data() as DaySchedule;
        schedules[schedule.date] = schedule;
      }
      onChange(schedules);
    },
    (error) => onError?.(error)
  );
}

export function subscribeAvailabilityForDates(
  householdId: string,
  dates: string[],
  onChange: (uploads: UploadedAvailability[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (dates.length === 0) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    query(
      collection(db, 'households', householdId, 'availability'),
      where('date', 'in', dates)
    ),
    (snapshot) => {
      onChange(snapshot.docs.map((availabilityDoc) => parseAvailabilityDoc(availabilityDoc)));
    },
    (error) => onError?.(error)
  );
}

export function subscribeMyAvailability(
  householdId: string,
  onChange: (uploads: UploadedAvailability[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const uid = requireUserId();

  return onSnapshot(
    query(
      collection(db, 'households', householdId, 'availability'),
      where('userId', '==', uid)
    ),
    (snapshot) => {
      onChange(
        snapshot.docs
          .map((availabilityDoc) => parseAvailabilityDoc(availabilityDoc))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
    },
    (error) => onError?.(error)
  );
}

export function subscribeHouseholdMembers(
  householdId: string,
  onChange: (household: NonNullable<UserProfile['household']>) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const householdRef = doc(db, 'households', householdId);
  const membersQuery = query(collection(db, 'users'), where('householdId', '==', householdId));

  let householdInviteCode: string | null = null;
  let members: Array<{ userId: string; displayName: string }> = [];

  const emit = () => {
    if (!householdInviteCode && members.length === 0) {
      return;
    }
    onChange({
      id: householdId,
      inviteCode: householdInviteCode,
      members,
    });
  };

  const unsubscribeHousehold = onSnapshot(
    householdRef,
    (snapshot) => {
      householdInviteCode = snapshot.exists()
        ? ((snapshot.data()?.inviteCode as string | null) ?? null)
        : null;
      emit();
    },
    (error) => onError?.(error)
  );

  const unsubscribeMembers = onSnapshot(
    membersQuery,
    (snapshot) => {
      members = snapshot.docs.map((memberDoc) => ({
        userId: memberDoc.id,
        displayName: (memberDoc.data().displayName as string) ?? memberDoc.id,
      }));
      emit();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubscribeHousehold();
    unsubscribeMembers();
  };
}

export async function deleteMyAvailability(householdId: string, date: string): Promise<void> {
  const uid = requireUserId();
  await deleteDoc(doc(db, 'households', householdId, 'availability', `${date}_${uid}`));
}

const FIRESTORE_BATCH_LIMIT = 500;

export async function deleteMyAvailabilityBefore(
  householdId: string,
  beforeDate: string
): Promise<number> {
  const uid = requireUserId();
  const uploads = await listMyAvailability(householdId);
  const toDelete = uploads.filter((upload) => upload.date < beforeDate);

  if (toDelete.length === 0) {
    return 0;
  }

  for (let index = 0; index < toDelete.length; index += FIRESTORE_BATCH_LIMIT) {
    const chunk = toDelete.slice(index, index + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const upload of chunk) {
      batch.delete(
        doc(db, 'households', householdId, 'availability', `${upload.date}_${uid}`)
      );
    }

    await batch.commit();
  }

  return toDelete.length;
}

export async function getSchedule(householdId: string, date: string): Promise<DaySchedule | null> {
  const scheduleDoc = await getDoc(doc(db, 'households', householdId, 'schedules', date));
  if (!scheduleDoc.exists()) {
    return null;
  }
  return scheduleDoc.data() as DaySchedule;
}

export async function getSchedulesForDates(
  householdId: string,
  dates: string[]
): Promise<Record<string, DaySchedule | null>> {
  const schedules = await Promise.all(dates.map((date) => getSchedule(householdId, date)));
  return Object.fromEntries(dates.map((date, index) => [date, schedules[index]]));
}

export async function regenerateSchedule(
  householdId: string,
  date: string
): Promise<DaySchedule> {
  const people = await getAvailabilityForDay(householdId, date);
  const watcherIds = people.map((person) => person.userId).sort();
  const inputHash = hashScheduleInput(date, people, watcherIds);
  const slots = generateSchedule(date, people, watcherIds);

  const schedule: DaySchedule = {
    date,
    householdId,
    slots,
    generatedAt: new Date().toISOString(),
    inputHash,
  };

  await setDoc(doc(db, 'households', householdId, 'schedules', date), schedule);
  return schedule;
}

export async function updateScheduleAssignment(
  householdId: string,
  date: string,
  start: string,
  assignment: Pick<ScheduleSlot, 'watcherId' | 'watcherName'>
): Promise<DaySchedule> {
  const scheduleRef = doc(db, 'households', householdId, 'schedules', date);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(scheduleRef);
    if (!snapshot.exists()) {
      throw new Error('This schedule no longer exists.');
    }
    const schedule = snapshot.data() as DaySchedule;
    const updated = {
      ...schedule,
      slots: schedule.slots.map((slot) => slot.start === start ? {
        ...slot,
        ...assignment,
        isManualOverride: true,
      } : slot),
    };
    transaction.set(scheduleRef, updated);
    return updated;
  });
}

export async function swapScheduleAssignments(
  householdId: string,
  source: { date: string; start: string },
  target: { date: string; start: string }
): Promise<DaySchedule[]> {
  const sourceRef = doc(db, 'households', householdId, 'schedules', source.date);
  const targetRef = doc(db, 'households', householdId, 'schedules', target.date);

  return runTransaction(db, async (transaction) => {
    const sourceSnapshot = await transaction.get(sourceRef);
    const targetSnapshot = source.date === target.date
      ? sourceSnapshot
      : await transaction.get(targetRef);
    if (!sourceSnapshot.exists() || !targetSnapshot.exists()) {
      throw new Error('One of these schedules no longer exists.');
    }

    const sourceSchedule = sourceSnapshot.data() as DaySchedule;
    const targetSchedule = targetSnapshot.data() as DaySchedule;
    const sourceSlot = sourceSchedule.slots.find((slot) => slot.start === source.start);
    const targetSlot = targetSchedule.slots.find((slot) => slot.start === target.start);
    if (!sourceSlot || !targetSlot) {
      throw new Error('One of these slots no longer exists.');
    }

    const applyAssignment = (
      schedule: DaySchedule,
      start: string,
      assignment: ScheduleSlot
    ): DaySchedule => ({
      ...schedule,
      slots: schedule.slots.map((slot) => slot.start === start ? {
        ...slot,
        watcherId: assignment.watcherId,
        watcherName: assignment.watcherName,
        isManualOverride: true,
      } : slot),
    });

    if (source.date === target.date) {
      const firstSwap = applyAssignment(sourceSchedule, source.start, targetSlot);
      const updated = applyAssignment(firstSwap, target.start, sourceSlot);
      transaction.set(sourceRef, updated);
      return [updated];
    }

    const updatedSource = applyAssignment(sourceSchedule, source.start, targetSlot);
    const updatedTarget = applyAssignment(targetSchedule, target.start, sourceSlot);
    transaction.set(sourceRef, updatedSource);
    transaction.set(targetRef, updatedTarget);
    return [updatedSource, updatedTarget];
  });
}
