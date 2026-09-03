#!/usr/bin/env bash
# A local ModCon HR you can actually sign into and click around.
#
#   npm run sandbox        -> http://localhost:5173
#
# Starts the Firestore and Auth emulators, seeds four accounts and an
# organisation on a trial, and runs the Vite dev server pointed at them.
#
# ## Why this exists
#
# `npm run dev` alone gives you the live Firebase project, where you need real
# credentials, where there is deliberately no self-registration, and where a
# careless click writes the organisation's real data. It also needs the deployed
# ruleset to be current, which it is not until somebody runs `rules:deploy`.
#
# This runs against emulators instead: nothing reaches Google, the accounts and
# their data vanish (or are exported, see below), and the rules under test are
# `firestore.rules` in the working tree — so a rules change can be exercised
# before it is deployed rather than after.
#
# ## Data between runs
#
# Exported to .sandbox-data on exit and imported next time, so a directory you
# spent an afternoon building survives a Ctrl-C. Delete that folder for a clean
# slate. It is gitignored.
set -euo pipefail

FIRESTORE_PORT=8080
AUTH_PORT=9099
DATA_DIR=".sandbox-data"

if lsof -nP -iTCP:"$FIRESTORE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[sandbox] Something is already listening on $FIRESTORE_PORT."
  echo "[sandbox] Stop it (an emulator from a test run?) and try again."
  exit 1
fi

# `--import` on a directory that does not exist is a hard error, so only pass it
# once there is something to import.
IMPORT_ARGS=()
if [ -d "$DATA_DIR" ]; then
  IMPORT_ARGS+=(--import="$DATA_DIR")
  echo "[sandbox] resuming from $DATA_DIR"
else
  echo "[sandbox] starting fresh (data will be saved to $DATA_DIR on exit)"
fi

# The dev build has to opt into the E2E account handling for the super admin
# address to be recognised — `superAdmin` on the profile comes from
# SUPER_ADMIN_EMAILS in src/lib/auth.tsx, not from the seeded document, and a
# build that has not opted in ships an empty list. See the note in
# scripts/sandbox-seed.mjs.
export VITE_ENABLE_E2E_ACCOUNTS=true
export VITE_E2E_SUPER_ADMIN_EMAIL=super@modcon.test
export VITE_FIRESTORE_EMULATOR_HOST="127.0.0.1:$FIRESTORE_PORT"
export VITE_AUTH_EMULATOR_HOST="127.0.0.1:$AUTH_PORT"

exec npx -y firebase-tools@latest emulators:exec \
  --only firestore,auth \
  --project modcon-hr \
  "${IMPORT_ARGS[@]}" \
  --export-on-exit="$DATA_DIR" \
  'node scripts/sandbox-seed.mjs && node scripts/sandbox-banner.mjs && npx vite --host'
