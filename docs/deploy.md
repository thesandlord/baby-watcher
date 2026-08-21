# Deployment

## Production

Production deploys run automatically via GitHub Actions when changes merge to `main`.

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

## One-time Firebase setup

1. Create a Firebase project for production.
2. Enable **Authentication** (Email/Password + Google), **Firestore**, and **Functions**.
3. Register a **Web app** in Firebase console and copy the config values.
4. Create a **service account** for CI:
   - Google Cloud Console → IAM → Service Accounts
   - Create key (JSON) for a account with Firebase deploy permissions
   - Recommended roles on the project:
     - `Firebase Hosting Admin`
     - `Firebase Rules Admin`
     - `Cloud Datastore User` (for Firestore rules/indexes deploy)
     - `Cloud Functions Admin` / `Service Account User` (for functions deploy)
     - `Firebase Extensions Viewer` (required by Firebase CLI to list extension instances during functions deploy, even when the project uses no extensions)
5. Set the Google AI API key used by calendar OCR:

```bash
firebase functions:secrets:set GOOGLE_API_KEY --project YOUR_PROJECT_ID
```

## GitHub secrets to configure

Add these in **GitHub → Settings → Secrets and variables → Actions** (repo: `thesandlord/baby-watcher`).

Also create a **`production` environment** in GitHub (Settings → Environments) if you want deployment protection rules.

### Firebase deploy

| Secret | Description |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON contents of the GCP service account key |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID (e.g. `baby-watcher-prod`) |

### Web app build (Vite — baked into the static bundle)

| Secret | Description |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `{projectId}.firebaseapp.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `{projectId}.appspot.com` or `{projectId}.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase web app ID |

Note: `VITE_FIREBASE_PROJECT_ID` is set automatically from `FIREBASE_PROJECT_ID` in the workflow. Calendar extraction uses Cloud Function `extractCalendar` (Gemini 3.5 Flash-Lite + BAML). The Google API key is **not** a GitHub/Vite secret — it lives in Firebase Secrets Manager as `GOOGLE_API_KEY`.

## Manual deploy trigger

You can also run the workflow manually from the **Actions** tab via **workflow_dispatch**.

## Troubleshooting deploy failures

### `firebaseextensions.googleapis.com` returns 403

Firebase CLI lists extension instances whenever functions are deployed, even if this project defines no extensions. Grant the CI service account **`Firebase Extensions Viewer`** (`roles/firebaseextensions.viewer`) on the Firebase/GCP project, then re-run deploy.

Example (replace `PROJECT_ID` and `SERVICE_ACCOUNT_EMAIL`):

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/firebaseextensions.viewer"
```

### Cloud Run logs: "The request was not authenticated" / browser CORS on `extractCalendar`

Gen 2 **callable** functions run on Cloud Run, which does not understand Firebase Auth tokens at the IAM layer. Unauthenticated OPTIONS (CORS preflight) must reach the service, or the browser reports a CORS failure and the UI may show `internal`.

`extractCalendar` sets `invoker: 'public'` in code, and the deploy workflow also runs [`scripts/ensure-extract-calendar-public.sh`](../scripts/ensure-extract-calendar-public.sh) after `firebase deploy` to:

1. Grant Cloud Run Invoker to `allUsers`, or
2. If Domain Restricted Sharing blocks that, disable the Cloud Run invoker IAM check (`--no-invoker-iam-check`)

Sign-in is still enforced in function code via `request.auth`.

The CI service account needs permission to set Cloud Run IAM (included in **Cloud Run Admin** / `roles/run.admin`, or at least `run.services.setIamPolicy`).

Manual repair (replace `PROJECT_ID`):

```bash
bash scripts/ensure-extract-calendar-public.sh PROJECT_ID
```

## What gets deployed

- **Firebase Hosting** — built Astro app from `web/dist`
- **Firestore rules** — `firestore.rules` and indexes
- **Cloud Functions** — `extractCalendar` callable (BAML + Gemini), Node.js **24** runtime (`nodejs24`)
