# Baby Watcher

Coordinate baby-watching coverage during the work day by uploading calendar screenshots and generating a fair, deterministic 8am–5pm schedule in 30-minute slots.

## Features

- Firebase Authentication (email/password and Google)
- Shared households with invite codes
- Calendar screenshot upload from mobile
- OpenRouter vision LLM extraction of busy slots
- Deterministic schedule generation with load balancing
- Mobile-first schedule UI with day picker and floating camera button

## Monorepo layout

- `shared/` — schedule types and deterministic generator
- `functions/` — Firebase Cloud Functions (OpenRouter extraction, Firestore writes)
- `web/` — Vite + React mobile web app

## Setup

1. Create a Firebase project and enable Auth, Firestore, Storage, and Functions.
2. Copy `.env.example` to `web/.env.local` and fill in Firebase web config values.
3. Install dependencies:

```bash
npm install
```

4. Set OpenRouter secrets for Functions:

```bash
firebase functions:secrets:set OPENROUTER_API_KEY
firebase functions:secrets:set OPENROUTER_VISION_MODEL
```

Recommended free vision model: `google/gemma-3-27b-it:free`

5. Run tests:

```bash
npm test
```

6. Start local development:

```bash
npm run dev:web
```

For emulator-backed development, set `VITE_USE_FIREBASE_EMULATORS=true` and run:

```bash
npm run dev:functions
```

## Deploy

```bash
npm run build
firebase deploy
```

## How scheduling works

For each 30-minute slot from 08:00 to 17:00, the scheduler assigns the available household member with the fewest prior assignments. Ties break deterministically on `userId`. The same inputs always produce the same schedule.

## Firestore model

- `users/{uid}` — profile and household membership
- `households/{householdId}` — invite code and member list
- `households/{householdId}/availability/{date}_{uid}` — extracted busy slots
- `households/{householdId}/schedules/{date}` — generated day schedule
