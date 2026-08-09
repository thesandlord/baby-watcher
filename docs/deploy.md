# Production deployment

Production deploys run automatically via GitHub Actions when changes merge to `main`.

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

## One-time Firebase setup

1. Create a Firebase project for production.
2. Enable **Authentication** (Email/Password + Google) and **Firestore**.
3. Register a **Web app** in Firebase console and copy the config values.
4. Create a **service account** for CI:
   - Google Cloud Console → IAM → Service Accounts
   - Create key (JSON) for a account with Firebase deploy permissions
   - Recommended roles on the project:
     - `Firebase Hosting Admin`
     - `Firebase Rules Admin`
     - `Cloud Datastore User` (for Firestore rules/indexes deploy)

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
| `VITE_OPENROUTER_API_KEY` | OpenRouter API key for calendar extraction |

### Optional

| Secret | Description |
| --- | --- |
| `VITE_OPENROUTER_VISION_MODEL` | Defaults to `google/gemma-3-27b-it:free` if unset |

Note: `VITE_FIREBASE_PROJECT_ID` is set automatically from `FIREBASE_PROJECT_ID` in the workflow.

## Manual deploy trigger

You can also run the workflow manually from the **Actions** tab via **workflow_dispatch**.

## What gets deployed

- **Firebase Hosting** — built Astro app from `web/dist`
- **Firestore rules** — `firestore.rules` and indexes
