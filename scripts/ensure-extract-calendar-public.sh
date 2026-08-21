#!/usr/bin/env bash
# Ensure Gen2 extractCalendar is reachable by Firebase web clients.
# Cloud Run IAM rejects unauthenticated OPTIONS/preflight with 403, which browsers
# surface as a CORS error. Firebase Auth is still enforced inside the function.
set -euo pipefail

PROJECT_ID="${1:?project id required}"
REGION="${2:-us-central1}"
FUNCTION_NAME="${3:-extractCalendar}"
# Gen2 Cloud Run service names are lowercase.
SERVICE_NAME="$(echo "$FUNCTION_NAME" | tr '[:upper:]' '[:lower:]')"
URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${FUNCTION_NAME}"

echo "Ensuring public invoke access for ${FUNCTION_NAME} in ${PROJECT_ID}/${REGION}..."

grant_all_users() {
  if gcloud functions add-invoker-policy-binding "$FUNCTION_NAME" \
    --region="$REGION" \
    --member="allUsers" \
    --project="$PROJECT_ID" \
    --quiet; then
    return 0
  fi

  # Fallback for older CLI / naming: bind directly on the Cloud Run service.
  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --region="$REGION" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --project="$PROJECT_ID" \
    --quiet
}

disable_invoker_iam_check() {
  # Recommended when Domain Restricted Sharing blocks allUsers.
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
  exit 1
fi

echo "Preflight reached the function gateway (HTTP ${STATUS})."
