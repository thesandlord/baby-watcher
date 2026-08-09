#!/usr/bin/env node
/**
 * Seeds the Firebase emulators with a 3-member demo household.
 * Run while emulators are up: npm run seed:demo
 */
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  getFirestore,
} from 'firebase/firestore';
import { generateSchedule, hashScheduleInput } from '@baby-watcher/shared';

const firebaseConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-baby-watcher.firebaseapp.com',
  projectId: 'demo-baby-watcher',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const date = new Date().toISOString().slice(0, 10);

const demoUsers = [
  {
    email: 'alice@example.com',
    password: 'password123',
    name: 'Alice',
    busySlots: [
      { start: '09:00', end: '11:00', title: 'Team meetings' },
      { start: '14:00', end: '15:00', title: 'Doctor call' },
    ],
  },
  {
    email: 'bob@example.com',
    password: 'password123',
    name: 'Bob',
    busySlots: [
      { start: '08:30', end: '10:00', title: 'Client sync' },
      { start: '13:00', end: '14:30', title: 'Lunch meeting' },
    ],
  },
  {
    email: 'carol@example.com',
    password: 'password123',
    name: 'Carol',
    busySlots: [
      { start: '10:30', end: '12:30', title: 'Workshop' },
      { start: '15:30', end: '17:00', title: 'School pickup' },
    ],
  },
];

async function ensureAuthUser({ email, password, name }) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return { uid: credential.user.uid, email, name };
  } catch (error) {
    if (error?.code === 'auth/email-already-in-use') {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      return { uid: credential.user.uid, email, name };
    }
    throw error;
  }
}

async function signInAs(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

async function main() {
  const aliceConfig = demoUsers[0];
  const alice = await ensureAuthUser(aliceConfig);

  let householdId;
  let inviteCode;

  const aliceDoc = await getDoc(doc(db, 'users', alice.uid));
  if (aliceDoc.exists() && aliceDoc.data().householdId) {
    householdId = aliceDoc.data().householdId;
    const householdDoc = await getDoc(doc(db, 'households', householdId));
    inviteCode = householdDoc.data()?.inviteCode ?? null;
  } else {
    const householdRef = doc(collection(db, 'households'));
    householdId = householdRef.id;
    inviteCode = householdRef.id.slice(0, 6).toUpperCase();

    await setDoc(householdRef, {
      createdAt: serverTimestamp(),
      createdBy: alice.uid,
      inviteCode,
      memberIds: [alice.uid],
    });

    await setDoc(doc(db, 'users', alice.uid), {
      displayName: alice.name,
      householdId,
      email: alice.email,
      updatedAt: serverTimestamp(),
    });
  }

  for (const userConfig of demoUsers.slice(1)) {
    const member = await ensureAuthUser(userConfig);
    const memberDoc = await getDoc(doc(db, 'users', member.uid));

    if (!memberDoc.exists() || memberDoc.data().householdId !== householdId) {
      await updateDoc(doc(db, 'households', householdId), {
        memberIds: arrayUnion(member.uid),
      });

      await setDoc(doc(db, 'users', member.uid), {
        displayName: member.name,
        householdId,
        email: member.email,
        updatedAt: serverTimestamp(),
      });
    }
  }

  const people = [];
  for (const userConfig of demoUsers) {
    await signInAs(userConfig.email, userConfig.password);
    const uid = auth.currentUser.uid;

    await setDoc(doc(db, 'households', householdId, 'availability', `${date}_${uid}`), {
      date,
      userId: uid,
      displayName: userConfig.name,
      busySlots: userConfig.busySlots,
      confidence: 'high',
      updatedAt: serverTimestamp(),
    });

    people.push({
      userId: uid,
      displayName: userConfig.name,
      busySlots: userConfig.busySlots,
    });
  }

  await signInAs(aliceConfig.email, aliceConfig.password);

  const watcherIds = people.map((person) => person.userId).sort();
  const schedule = {
    date,
    householdId,
    slots: generateSchedule(date, people, watcherIds),
    generatedAt: new Date().toISOString(),
    inputHash: hashScheduleInput(date, people, watcherIds),
  };

  await setDoc(doc(db, 'households', householdId, 'schedules', date), schedule);

  console.log('Demo household seeded.');
  console.log(`  Household: ${householdId}`);
  console.log(`  Invite code: ${inviteCode}`);
  console.log(`  Members: ${demoUsers.map((user) => user.name).join(', ')}`);
  console.log('  Login: alice@example.com / password123');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
