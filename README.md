# Baby Watcher

Coordinate baby-watching coverage during the work day by uploading calendar screenshots and generating a fair, deterministic 8am–5pm schedule in 30-minute watch slots. Meeting times support 15-minute precision.

Firebase Auth + Firestore hold household data. Calendar screenshot OCR runs in a secure Cloud Function using Gemini 2.5 Flash-Lite with BAML structured outputs. Schedule generation stays deterministic in the shared package / browser.

## Features

- Firebase Authentication (email/password and Google)
- Shared households with invite codes
- Calendar screenshot upload from mobile
- Secure Cloud Function OCR (Gemini 2.5 Flash-Lite + BAML)
- Deterministic schedule generation with load balancing
- Mobile-first schedule UI with day picker and floating camera button

## Monorepo layout

- `shared/` — schedule types and deterministic generator
- `web/` — Astro app with React islands and direct Firestore access
- `functions/` — Cloud Functions (calendar extraction via BAML + Gemini)

## Setup

1. Create a Firebase project and enable Auth + Firestore + Functions.
2. Copy `.env.example` to `web/.env.local` and fill in Firebase web config values.
3. Set the Google AI API key as a Firebase secret (never in the client):

```bash
firebase functions:secrets:set GOOGLE_API_KEY --project YOUR_PROJECT_ID
```

4. Install dependencies:

```bash
npm install
npm install --prefix functions
```

5. Run tests:

```bash
npm test
```

6. Start local development:

```bash
npm run dev:web
```

## Local dev with Firebase emulators

Run Auth + Firestore emulators alongside the Astro dev server with one command:

```bash
npm run dev:local
```

This script:
- Copies `web/.env.emulator.example` to `web/.env.local` if missing
- Starts Firestore (8080) and Auth (9099) emulators with the demo project `demo-baby-watcher`
- Starts Astro on http://localhost:4323
- Enables mock calendar extraction so you can test uploads without a Google API key

Seed a 3-member demo household (Alice, Bob, Carol) with availability + schedule:

```bash
npm run seed:demo
```

Login with `alice@example.com` / `password123`.

Emulator UI: http://localhost:4000

See [docs/local-dev.md](docs/local-dev.md) for emulator setup details (including Java requirement).

To exercise the real OCR path locally, set `VITE_MOCK_CALENDAR_EXTRACTION=false`, run the functions emulator with `GOOGLE_API_KEY` available, and point the web app at it (`VITE_USE_FIREBASE_EMULATORS=true`).

## Deploy

### Automatic (recommended)

- **`main` merges** — production deploy to Firebase Hosting, Firestore rules, and Cloud Functions.

See [docs/deploy.md](docs/deploy.md) for the full list of GitHub secrets to configure. Ensure `GOOGLE_API_KEY` is set as a Firebase/GCP secret before the first functions deploy.

### Manual

```bash
npm run build
npm run build --prefix functions
firebase deploy --only firestore,hosting,functions --project YOUR_PROJECT_ID
```

## How scheduling works

For each 30-minute watch slot from 08:00 to 17:00, the scheduler assigns the available household member with the fewest prior assignments. Ties break deterministically on `userId`. The same inputs always produce the same schedule.

## Firestore model

- `users/{uid}` — profile and household membership
- `households/{householdId}` — invite code and member list
- `households/{householdId}/availability/{date}_{uid}` — extracted busy slots
- `households/{householdId}/schedules/{date}` — generated day schedule

## Security note

The Google AI API key stays in Cloud Functions as a Firebase secret (`GOOGLE_API_KEY`). The web client never receives it; authenticated users call the `extractCalendar` callable instead.
