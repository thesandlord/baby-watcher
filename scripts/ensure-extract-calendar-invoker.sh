#!/usr/bin/env bash
# Gen2 callables sit behind Cloud Run IAM. Firebase Auth ID tokens are NOT Cloud
# Run credentials, so the service must allow unauthenticated *network* invoke
# (allUsers / Allow public access). App users are still gated in function code
# via request.auth — unsigned callers get HttpsError('unauthenticated').
set -euo pipefail

PROJECT_ID="${1:?project id required}"
REGION="${2:-us-central1}"
FUNCTION_NAME="${3:-extractCalendar}"
SERVICE_NAME="$(echo "$FUNCTION_NAME" | tr '[:upper:]' '[:lower:]')"
URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${FUNCTION_NAME}"

echo "Allowing Cloud Run network invoke for ${FUNCTION_NAME} (Firebase Auth still required in code)..."

grant_all_users() {
  if gcloud functions add-invoker-policy-binding "$FUNCTION_NAME" \
    --region="$REGION" \
    --member="allUsers" \
    --project="$PROJECT_ID" \
    --quiet; then
    return 0
  fi

  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --region="$REGION" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --project="$PROJECT_ID" \
    --quiet
}

disable_invoker_iam_check() {
  # Use when Domain Restricted Sharing blocks the allUsers principal.
  gcloud run services update "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --no-invoker-iam-check \
    --quiet
}

if ! grant_all_users; then
  echo "allUsers invoker binding failed; trying --no-invoker-iam-check..."
  disable_invoker_iam_check
fi

echo "Verifying unauthenticated preflight can reach ${URL}..."
TMP_BODY="$(mktemp)"
STATUS="$(
  curl -sS -o "$TMP_BODY" -w '%{http_code}' -X OPTIONS "$URL" \
    -H 'Origin: https://baby.sandeepdinesh.com' \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: authorization,content-type'
)"
BODY="$(cat "$TMP_BODY")"
rm -f "$TMP_BODY"

if [[ "$STATUS" == "403" ]] && grep -q 'does not have permission' <<<"$BODY"; then
  echo "Cloud Run still blocks unauthenticated invoke (HTTP ${STATUS})."
  echo "$BODY"
  echo "In Cloud Run → Security, choose Allow public access (Firebase Auth remains enforced in code)."
  exit 1
fi

echo "Preflight reached the function gateway (HTTP ${STATUS})."
