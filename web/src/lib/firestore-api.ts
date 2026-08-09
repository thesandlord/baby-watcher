import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import {
  generateSchedule,
  hashScheduleInput,
  type DaySchedule,
  type PersonAvailability,
} from '@baby-watcher/shared';
import { auth, db } from './firebase';
import type { UserProfile } from './utils';

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

export async function getSchedule(householdId: string, date: string): Promise<DaySchedule | null> {
  const scheduleDoc = await getDoc(doc(db, 'households', householdId, 'schedules', date));
  if (!scheduleDoc.exists()) {
    return null;
  }
  return scheduleDoc.data() as DaySchedule;
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

export async function loadOrGenerateSchedule(
  householdId: string,
  date: string
): Promise<DaySchedule> {
  const existing = await getSchedule(householdId, date);
  if (existing) {
    return existing;
  }
  return regenerateSchedule(householdId, date);
}
