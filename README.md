# Baby Watcher

Coordinate baby-watching coverage during the work day by uploading calendar screenshots and generating a fair, deterministic 8am–5pm schedule in 30-minute slots.

Everything runs client-side: Firebase Auth + Firestore for data, OpenRouter for calendar extraction, and a shared deterministic scheduler in the browser.

## Features

- Firebase Authentication (email/password and Google)
- Shared households with invite codes
- Calendar screenshot upload from mobile
- Client-side OpenRouter vision LLM extraction of busy slots
- Deterministic schedule generation with load balancing
- Mobile-first schedule UI with day picker and floating camera button
- No Cloud Functions required

## Monorepo layout

- `shared/` — schedule types and deterministic generator
- `web/` — Vite + React mobile web app with direct Firestore access

## Setup

1. Create a Firebase project and enable Auth + Firestore.
2. Copy `.env.example` to `web/.env.local` and fill in Firebase + OpenRouter values.
3. Install dependencies:

```bash
npm install
```

Recommended free vision model: `google/gemma-3-27b-it:free`

4. Run tests:

```bash
npm test
```

5. Start local development:

```bash
npm run dev:web
```

For emulator-backed development, set `VITE_USE_FIREBASE_EMULATORS=true` and run:

```bash
npm run dev:emulators
```

## Deploy

```bash
npm run build
firebase deploy --only firestore,hosting
```

## How scheduling works

For each 30-minute slot from 08:00 to 17:00, the scheduler assigns the available household member with the fewest prior assignments. Ties break deterministically on `userId`. The same inputs always produce the same schedule.

## Firestore model

- `users/{uid}` — profile and household membership
- `households/{householdId}` — invite code and member list
- `households/{householdId}/availability/{date}_{uid}` — extracted busy slots
- `households/{householdId}/schedules/{date}` — generated day schedule

## Security note

The OpenRouter API key is configured in the client for simplicity. Restrict it by HTTP referrer in the OpenRouter dashboard, or swap to a small proxy later if you want to hide the key.
