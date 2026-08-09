#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/web/.env.local"
ENV_EXAMPLE="$ROOT/web/.env.emulator.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE from emulator template."
fi

cd "$ROOT"
npm run build --workspace=shared
