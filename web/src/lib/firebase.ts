import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const functions = getFunctions(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export const createHousehold = httpsCallable(functions, 'createHousehold');
export const joinHousehold = httpsCallable(functions, 'joinHousehold');
export const uploadCalendar = httpsCallable(functions, 'uploadCalendar');
export const regenerateSchedule = httpsCallable(functions, 'regenerateSchedule');
export const getSchedule = httpsCallable(functions, 'getSchedule');
export const getProfile = httpsCallable(functions, 'getProfile');
