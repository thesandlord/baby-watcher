# Deployment

## Production

Production deploys run automatically via GitHub Actions when changes merge to `main`.

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

## One-time Firebase setup

1. Create a Firebase project for production.
2. Enable **Authentication** (Email/Password + Google), **Firestore**, and **Functions**.
3. Register a **Web app** in Firebase console and copy the config values.
4. As a project **Owner**, enable these Google Cloud APIs (Firebase CLI cannot enable them if the CI account lacks Service Usage permission):
   - [Cloud Functions](https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com)
   - [Cloud Build](https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com)
   - [Artifact Registry](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com)
   - [Cloud Runtime Configuration](https://console.cloud.google.com/apis/library/runtimeconfig.googleapis.com)
   - [Secret Manager](https://console.cloud.google.com/apis/library/secretmanager.googleapis.com)
5. Create a **service account** for CI:
   - Google Cloud Console → IAM → Service Accounts
   - Create key (JSON) for an account with Firebase deploy permissions
   - Recommended roles on the project:
     - `Firebase Hosting Admin` (`roles/firebasehosting.admin`)
     - `Firebase Rules Admin` (`roles/firebaserules.admin`)
     - `Cloud Datastore User` (`roles/datastore.user`) — Firestore rules/indexes
     - `Cloud Functions Admin` (`roles/cloudfunctions.admin`)
     - `Service Account User` (`roles/iam.serviceAccountUser`)
     - `Service Usage Admin` (`roles/serviceusage.serviceUsageAdmin`) — required so deploy can check/enable APIs (fixes `403 … runtimeconfig.googleapis.com`)
     - `Cloud RuntimeConfig Admin` (`roles/runtimeconfig.admin`)
     - `Artifact Registry Administrator` (`roles/artifactregistry.admin`)
     - `Cloud Build Editor` (`roles/cloudbuild.builds.editor`)
     - `Secret Manager Admin` (`roles/secretmanager.admin`) — for `GOOGLE_API_KEY` / function secrets
6. Set the Google AI API key used by calendar OCR:

```bash
firebase functions:secrets:set GOOGLE_API_KEY --project YOUR_PROJECT_ID
```

### Fix: `403 Permission denied to get service [runtimeconfig.googleapis.com]`

This means the GitHub Actions service account cannot query Service Usage for Runtime Config. Do both:

1. Enable **Cloud Runtime Configuration API** in the project (link above) while signed in as Owner.
2. Grant the CI service account **Service Usage Admin** and **Cloud RuntimeConfig Admin** (roles listed above).

Then re-run the deploy workflow.

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

## What gets deployed

- **Firebase Hosting** — built Astro app from `web/dist`
- **Firestore rules** — `firestore.rules` and indexes
- **Cloud Functions** — `extractCalendar` callable (BAML + Gemini)
