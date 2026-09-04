#!/usr/bin/env bash
# Run the Playwright suite with Firestore emulated.
#
# The suite must not touch the live project: a live run writes the
# organisation's real configuration, and one exhausted the project's daily quota
# for a whole day, blocking the app and stranding fake leave policies where every
# employee could see them. playwright.config.ts therefore points the bundle and
# the specs' REST helpers at 127.0.0.1:8080 unless E2E_LIVE_FIRESTORE=true.
#
# That default needs an emulator to exist. This script supplies one:
#   - already listening on 8080  -> use it, run Playwright directly
#     (`firebase emulators:exec` refuses to start a second one: "port taken")
#   - nothing there              -> start one for the run and shut it down after
#
# Every argument is passed through: `npm run test:e2e -- --project=app -g "…"`.
set -euo pipefail

PORT=8080

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[e2e] Firestore emulator already listening on $PORT — using it."
  exec npx playwright test "$@"
fi

echo "[e2e] no emulator on $PORT — starting one for this run."
exec npx -y firebase-tools@latest emulators:exec \
  --only firestore,auth --project modconhr-b2789 \
  "npx playwright test $*"
