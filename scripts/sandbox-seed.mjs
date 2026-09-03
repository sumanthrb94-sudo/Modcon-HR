#!/usr/bin/env node
/**
 * Seed the emulators so the app is worth signing into.
 *
 * A blank Firestore emulator gives you a login page you cannot get past: there
 * is deliberately no self-registration in this app (an account created that way
 * carried no `orgId`, and "no orgId" used to resolve to the default
 * organisation, so anyone who signed up read the incumbent tenant's data). Every
 * account is created by an administrator — which is fine in production and
 * useless for clicking around locally.
 *
 * So this creates the four accounts, gives each the role the app reads from
 * `users/{uid}`, writes the organisation record with a trial running on it, and
 * links two of them to employee records so self-service has somebody to be.
 *
 * Run through `npm run sandbox`, which starts the emulators first. On its own it
 * does nothing but fail to connect.
 *
 * ## Nothing here touches the live project
 *
 * Both bases point at 127.0.0.1 and the Firestore writes use the emulator's
 * `Bearer owner` bypass, which exists only in the emulator. There is no code
 * path in this file that can reach Google.
 */

const FIRESTORE_HOST = process.env.SANDBOX_FIRESTORE ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.SANDBOX_AUTH ?? '127.0.0.1:9099';
const PROJECT = 'modcon-hr';

const FIRESTORE = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const IDENTITY = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

/** The emulator ignores it; the REST surface still requires one. */
const API_KEY = 'sandbox';

export const SANDBOX_PASSWORD = 'Sandbox@123';

/**
 * Who you can sign in as.
 *
 * `role` is written to `users/{uid}` and is the whole of it: the sign-in upsert
 * reads a stored role and carries it forward, so no email allow-list is
 * involved for hr / manager / employee.
 *
 * The super admin is the exception. `superAdmin` on the profile is derived from
 * `SUPER_ADMIN_EMAILS` in src/lib/auth.tsx, not from the document — so this
 * address has to be passed into the dev build as `VITE_E2E_SUPER_ADMIN_EMAIL`
 * (scripts/sandbox.sh does that) and the build has to have opted into E2E
 * accounts. A production build ships neither, whatever the environment says.
 *
 * It also deliberately carries **no** `orgId`: a super admin administers every
 * organisation rather than belonging to one, and giving it one would pin it to
 * the default org so the org switcher would appear to do nothing.
 */
export const SANDBOX_ACCOUNTS = [
  {
    email: 'super@modcon.test',
    role: 'admin',
    superAdmin: true,
    orgId: null,
    employeeId: null,
    what: 'Organizations, subscriptions, trials and overrides. Not scoped to one org.',
  },
  {
    email: 'hr@modcon.test',
    role: 'hr',
    superAdmin: false,
    orgId: 'default',
    // Linked to the first seed employee, so Finance, My Attendance and the
    // payslip surfaces have a person to be about. Without a link the rules
    // resolve the account to nobody and it reads none of its own salary.
    employeeId: 'emp-001',
    what: 'Runs the organisation: settings, payroll, directory, approvals.',
  },
  {
    email: 'manager@modcon.test',
    role: 'manager',
    superAdmin: false,
    orgId: 'default',
    employeeId: 'emp-002',
    what: 'Team view and the approval queues scoped to their reporting line.',
  },
  {
    email: 'employee@modcon.test',
    role: 'employee',
    superAdmin: false,
    orgId: 'default',
    employeeId: 'emp-003',
    what: 'Self-service only: own attendance, leave, payslips, The Board.',
  },
];

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Create the account, or find it if a previous run already did.
 *
 * Idempotent on purpose: the sandbox is restarted constantly, and a seed step
 * that fails the second time is a seed step nobody runs.
 */
async function ensureAccount(email, password) {
  const created = await fetch(`${IDENTITY}/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await json(created);
  if (body.localId) return body.localId;

  const signedIn = await fetch(`${IDENTITY}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const existing = await json(signedIn);
  if (existing.localId) return existing.localId;

  throw new Error(
    `could not create or sign in ${email}: ${JSON.stringify(body.error ?? body)}`,
  );
}

/** PATCH a document with the emulator's owner bypass. */
async function write(path, fields) {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`writing ${path} failed: ${res.status} ${await res.text()}`);
  }
}

const str = (stringValue) => ({ stringValue });
const bool = (booleanValue) => ({ booleanValue });
const int = (value) => ({ integerValue: String(value) });

function isoInDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function waitForEmulators(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const [firestore, auth] = await Promise.all([
        fetch(`http://${FIRESTORE_HOST}/`).then((r) => r.status, () => 0),
        fetch(`http://${AUTH_HOST}/`).then((r) => r.status, () => 0),
      ]);
      if (firestore > 0 && auth > 0) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `no emulators on ${FIRESTORE_HOST} / ${AUTH_HOST}. Run this through \`npm run sandbox\`.`,
  );
}

export async function seed() {
  await waitForEmulators();

  for (const account of SANDBOX_ACCOUNTS) {
    const uid = await ensureAccount(account.email, SANDBOX_PASSWORD);

    await write(`users/${uid}`, {
      uid: str(uid),
      email: str(account.email),
      displayName: str(account.email.split('@')[0]),
      role: str(account.role),
      superAdmin: bool(account.superAdmin),
      ...(account.orgId ? { orgId: str(account.orgId) } : {}),
    });

    // `employee_links/{uid}` is what `isSelf()` resolves in firestore.rules and
    // what `useMyEmployeeId` reads. Without it an account is nobody: it reads
    // none of its own salary or leave, and check-in has no day to stamp — and
    // it fails closed and silently, which is exactly the confusing empty screen
    // this seeding exists to avoid.
    if (account.employeeId) {
      await write(`employee_links/${uid}`, {
        uid: str(uid),
        employeeId: str(account.employeeId),
        orgId: str(account.orgId ?? 'default'),
        linkedBy: str('sandbox'),
      });
    }

    console.log(`  ${account.email.padEnd(22)} ${account.role}${account.superAdmin ? ' + super admin' : ''}`);
  }

  // The organisation record. A trial four days out on purpose: the countdown
  // banner is quiet until the last five days (QUIET_UNTIL_DAYS in
  // SubscriptionBanner), so a fourteen-day trial would show nothing at all and
  // read as a broken feature. Four days in means the banner is on screen and
  // the super admin console can move it.
  await write('organizations/default', {
    name: str('ModCon Builders'),
    adminEmail: str('hr@modcon.test'),
    createdBy: str('sandbox'),
    trialStartedAt: str(isoInDays(-10)),
    trialEndsAt: str(isoInDays(4)),
    trialPricePaise: int(100),
    graceDays: int(3),
    trialEndBehaviour: str('lock'),
    planName: str('Sandbox'),
    seats: int(25),
  });

  console.log('  organizations/default   ₹1 trial, 4 days left, 3 days grace');
}

// Run when invoked directly rather than imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((error) => {
    console.error(`\n[sandbox] ${error.message}\n`);
    process.exit(1);
  });
}
