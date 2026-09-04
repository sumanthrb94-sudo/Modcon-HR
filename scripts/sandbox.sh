#!/usr/bin/env bash
# A local ModCon HR you can actually sign into and click around.
#
#   npm run sandbox        -> http://localhost:5173
#
# Starts the Firestore and Auth emulators, seeds four accounts and an
# organisation on a trial, and runs the Vite dev server pointed at them.
# Ctrl-C stops everything.
#
# ## Why this exists
#
# `npm run dev` alone gives you the live Firebase project: you need real
# credentials, there is deliberately no self-registration to get past the login
# page, a careless click writes the organisation's real data, and the rules it
# runs against are whatever was last deployed rather than what is in the working
# tree.
#
# This runs against emulators instead. Nothing reaches Google, the accounts are
# created for you, and the ruleset under test is `firestore.rules` as it stands —
# so a rules change can be exercised before it ships rather than after.
#
# ## Every run starts clean, on purpose
#
# The emulators keep nothing between runs. That is the right default for a test
# environment: you always know what state you are looking at.
#
# `--export-on-exit` was written here and removed after testing it. Under
# `emulators:exec` it fires when the wrapped command exits *normally*, and the
# wrapped command here is a dev server you stop with Ctrl-C — so it never ran,
# `.sandbox-data` was never written, and the paired `--import` never had
# anything to import. A sandbox that claims to keep your data and does not is
# worse than one that says it will not.
#
# To keep data, run the emulators yourself in another terminal —
#   npx firebase-tools@latest emulators:start --only firestore,auth \
#     --project modconhr-b2789 --import=.sandbox-data --export-on-exit=.sandbox-data
# then `npm run sandbox` finds them already listening and uses them.
set -euo pipefail

FIRESTORE_PORT=8080
AUTH_PORT=9099
PROJECT=modconhr-b2789

# The dev build has to opt into the E2E account handling for the super admin
# address to be recognised — `superAdmin` on the profile comes from
# SUPER_ADMIN_EMAILS in src/lib/auth.tsx, not from the seeded document, and a
# build that has not opted in ships an empty list. A production build ships
# neither of these, whatever the environment says.
export VITE_ENABLE_E2E_ACCOUNTS=true
export VITE_E2E_SUPER_ADMIN_EMAIL=super@modcon.test
export VITE_FIRESTORE_EMULATOR_HOST="127.0.0.1:$FIRESTORE_PORT"
export VITE_AUTH_EMULATOR_HOST="127.0.0.1:$AUTH_PORT"

RUN='node scripts/sandbox-seed.mjs && node scripts/sandbox-banner.mjs && npx vite --host'

# An emulator already listening is used rather than fought over: `emulators:exec`
# refuses to start a second one ("port taken"), and somebody running their own
# with persistence is the documented way to keep data.
if lsof -nP -iTCP:"$FIRESTORE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[sandbox] emulator already listening on $FIRESTORE_PORT — using it."
  exec bash -c "$RUN"
fi

exec npx -y firebase-tools@latest emulators:exec \
  --only firestore,auth \
  --project "$PROJECT" \
  "$RUN"
