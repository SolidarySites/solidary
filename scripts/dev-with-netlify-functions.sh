#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
FUNCTIONS_PORT="${FUNCTIONS_PORT:-8888}"

"$ROOT_DIR/scripts/serve-functions.sh" \
  --port "$FUNCTIONS_PORT" \
  >/tmp/solidary-functions-dev.log 2>&1 &
FUNCTIONS_PID=$!

cleanup() {
  kill "$FUNCTIONS_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

npm -w apps/site run dev -- --strictPort "$@"
