import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  generateSchedule,
  hashScheduleInput,
  type PersonAvailability,
  type DaySchedule,
} from '@baby-watcher/shared';
import { extractCalendarFromImage } from './openrouter.js';

initializeApp();

const db = getFirestore();
const auth = getAuth();
const storage = getStorage();

async function requireUser(uid: string) {
  const user = await auth.getUser(uid);
  return user;
}

async function getHouseholdIdForUser(uid: string): Promise<string> {
  const profile = await db.collection('users').doc(uid).get();
  const householdId = profile.data()?.householdId as string | undefined;
  if (!householdId) {
    throw new HttpsError('failed-precondition', 'Join or create a household first.');
  }
  return householdId;
}

async function getHouseholdMembers(householdId: string) {
  const snapshot = await db
    .collection('users')
    .where('householdId', '==', householdId)
    .get();

  return snapshot.docs.map((doc) => ({
    userId: doc.id,
    displayName: (doc.data().displayName as string) ?? doc.id,
  }));
}

async function getAvailabilityForDay(
  householdId: string,
  date: string
): Promise<PersonAvailability[]> {
  const members = await getHouseholdMembers(householdId);
  const availabilityDocs = await Promise.all(
    members.map(async (member) => {
      const doc = await db
        .collection('households')
        .doc(householdId)
        .collection('availability')
        .doc(`${date}_${member.userId}`)
        .get();

      return {
        userId: member.userId,
        displayName: member.displayName,
        busySlots: doc.exists ? doc.data()?.busySlots ?? [] : [],
      };
    })
  );

  return availabilityDocs;
}

export const createHousehold = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const user = await requireUser(uid);
  const displayName =
    (request.data?.displayName as string | undefined) ??
    user.displayName ??
    user.email ??
    'Watcher';

  const existing = await db.collection('users').doc(uid).get();
  if (existing.exists && existing.data()?.householdId) {
    return { householdId: existing.data()?.householdId };
  }

  const householdRef = db.collection('households').doc();
  const inviteCode = householdRef.id.slice(0, 6).toUpperCase();

  await db.runTransaction(async (transaction) => {
    transaction.set(householdRef, {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      inviteCode,
      memberIds: [uid],
    });

    transaction.set(
      db.collection('users').doc(uid),
      {
        displayName,
        householdId: householdRef.id,
        email: user.email ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { householdId: householdRef.id, inviteCode };
});

export const joinHousehold = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const inviteCode = (request.data?.inviteCode as string | undefined)?.trim().toUpperCase();
  if (!inviteCode) {
    throw new HttpsError('invalid-argument', 'Invite code is required.');
  }

  const householdQuery = await db
    .collection('households')
    .where('inviteCode', '==', inviteCode)
    .limit(1)
    .get();

  if (householdQuery.empty) {
    throw new HttpsError('not-found', 'Household not found.');
  }

  const householdDoc = householdQuery.docs[0];
  const user = await requireUser(uid);
  const displayName =
    (request.data?.displayName as string | undefined) ??
    user.displayName ??
    user.email ??
    'Watcher';

  await db.runTransaction(async (transaction) => {
    transaction.update(householdDoc.ref, {
      memberIds: FieldValue.arrayUnion(uid),
    });

    transaction.set(
      db.collection('users').doc(uid),
      {
        displayName,
        householdId: householdDoc.id,
        email: user.email ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { householdId: householdDoc.id };
});

export const uploadCalendar = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 120,
    secrets: ['OPENROUTER_API_KEY', 'OPENROUTER_VISION_MODEL'],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const imageBase64 = request.data?.imageBase64 as string | undefined;
    const mimeType = (request.data?.mimeType as string | undefined) ?? 'image/jpeg';
    const hintedDate = request.data?.date as string | undefined;

    if (!imageBase64) {
      throw new HttpsError('invalid-argument', 'Image data is required.');
    }

    const householdId = await getHouseholdIdForUser(uid);
    const extraction = await extractCalendarFromImage(imageBase64, mimeType, hintedDate);

    if (extraction.needsDateConfirmation && !hintedDate) {
      return {
        needsDateConfirmation: true,
        extraction,
      };
    }

    const date = extraction.date ?? hintedDate;
    if (!date) {
      throw new HttpsError(
        'failed-precondition',
        'Could not determine the calendar date. Please provide one.'
      );
    }

    const user = await requireUser(uid);
    const profile = await db.collection('users').doc(uid).get();
    const displayName =
      (profile.data()?.displayName as string | undefined) ??
      user.displayName ??
      user.email ??
      uid;

    await db
      .collection('households')
      .doc(householdId)
      .collection('availability')
      .doc(`${date}_${uid}`)
      .set({
        date,
        userId: uid,
        displayName,
        busySlots: extraction.busySlots,
        confidence: extraction.confidence,
        updatedAt: FieldValue.serverTimestamp(),
      });

    const bucket = storage.bucket();
    const filePath = `calendars/${householdId}/${date}/${uid}-${Date.now()}.${mimeType.split('/')[1] ?? 'jpg'}`;
    await bucket.file(filePath).save(Buffer.from(imageBase64, 'base64'), {
      metadata: { contentType: mimeType },
    });

    const schedule = await regenerateScheduleInternal(householdId, date);

    return {
      needsDateConfirmation: false,
      extraction: { ...extraction, date },
      schedule,
    };
  }
);

export const regenerateSchedule = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const date = request.data?.date as string | undefined;
  if (!date) {
    throw new HttpsError('invalid-argument', 'Date is required.');
  }

  const householdId = await getHouseholdIdForUser(uid);
  const schedule = await regenerateScheduleInternal(householdId, date);
  return { schedule };
});

export const getSchedule = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const date = request.data?.date as string | undefined;
  if (!date) {
    throw new HttpsError('invalid-argument', 'Date is required.');
  }

  const householdId = await getHouseholdIdForUser(uid);
  const scheduleDoc = await db
    .collection('households')
    .doc(householdId)
    .collection('schedules')
    .doc(date)
    .get();

  if (!scheduleDoc.exists) {
    const schedule = await regenerateScheduleInternal(householdId, date);
    return { schedule };
  }

  return { schedule: scheduleDoc.data() as DaySchedule };
});

export const getProfile = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const profileDoc = await db.collection('users').doc(uid).get();
  if (!profileDoc.exists) {
    return { profile: null };
  }

  const profile = profileDoc.data()!;
  let household = null;

  if (profile.householdId) {
    const members = await getHouseholdMembers(profile.householdId);
    const householdDoc = await db.collection('households').doc(profile.householdId).get();
    household = {
      id: profile.householdId,
      inviteCode: householdDoc.data()?.inviteCode ?? null,
      members,
    };
  }

  return {
    profile: {
      uid,
      displayName: profile.displayName,
      email: profile.email,
      household,
    },
  };
});

async function regenerateScheduleInternal(
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

  await db
    .collection('households')
    .doc(householdId)
    .collection('schedules')
    .doc(date)
    .set(schedule);

  return schedule;
}
