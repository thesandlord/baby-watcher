import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4323';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev --workspace=web',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-baby-watcher.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-baby-watcher',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-baby-watcher.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
      VITE_FIREBASE_APP_ID: '1:123456789012:web:demo',
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_MOCK_CALENDAR_EXTRACTION: 'true',
      VITE_FIXED_TODAY: '2026-08-11',
    },
  },
});
