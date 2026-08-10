/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_OPENROUTER_API_KEY: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
  readonly VITE_MOCK_CALENDAR_EXTRACTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
