import { test, expect, type Page } from '@playwright/test';
import { FIREBASE_API_KEY, PERSONAS } from './config';

/**
 * Administrator-driven account provisioning, through the real Admin dashboard.
 *
 * There is no self-registration: an account is created by someone who already
 * holds the privilege, and stamped with their organisation at the moment it is
 * created, so an unassigned account never exists (see src/lib/accountInvites.ts
 * and G7 in docs/tenant-isolation-spec.md).
 *
 * ## What runs here, and what does not
 *
 * The **boundary** — who may create an account, in which organisation, with
 * which role — is enforced by `firestore.rules` and tested against the emulator
 * in tests/rules/, where it can run on every iteration for nothing. This suite
 * covers only what those tests structurally cannot see: what the *UI* offers.
 *
 * The unconditional tests below are read-only. They open the form and assert
 * its shape without submitting it, so a run leaves nothing behind.
 *
 * Creating an account is gated behind `E2E_ALLOW_ACCOUNT_CREATION=1`, and the
 * gate is not politeness. The E2E suite signs in against **live** Firebase, so
 * a creation test provisions a real Auth account in the production project on
 * every run. `cleanUp` below removes it again, but half of that cleanup goes
 * through the Firestore REST API, which is quota-limited — and when the quota
 * is exhausted the cleanup silently cannot run while the creation still can.
 * Ungated, the failure mode is an accumulating pile of real accounts in a real
 * project, so it is opt-in and the operator chooses when to pay for it.
 *
 *   E2E_ALLOW_ACCOUNT_CREATION=1 npx playwright test tests/e2e/provisioning.spec.ts --project=app
 */

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/modcon-hr/databases/(default)/documents';

/** Roles the form is allowed to offer. `admin` is deliberately not among them. */
const INVITABLE_LABELS = ['Employee', 'Manager', 'HR Manager'];

async function signIn(page: Page, persona: typeof PERSONAS.admin) {
  await page.goto('/login');
  await page.locator('#username').fill(persona.email);
  await page.locator('#password').fill(persona.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openCreateAccount(page: Page) {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Create an account')).toBeVisible();
  return dialog;
}

async function idTokenFor(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${IDENTITY}:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = (await res.json()) as { idToken?: string };
  return data.idToken ?? null;
}

/**
 * Undo a creation: the Auth account first, then the documents it left behind.
 *
 * Order matters. The Auth account is deleted with its *own* token, so it has to
 * happen while the temporary password still works. Everything after is done as
 * the admin, and is best-effort — a failure here must not mask the assertion
 * that the test was actually making.
 */
async function cleanUp(email: string, tempPassword: string, uid: string) {
  const theirs = await idTokenFor(email, tempPassword);
  if (theirs) {
    await fetch(`${IDENTITY}:delete?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: theirs }),
    }).catch(() => {});
  }

  const admin = await idTokenFor(PERSONAS.admin.email, PERSONAS.admin.password);
  if (!admin) return;
  const headers = { Authorization: `Bearer ${admin}` };
  for (const path of [
    `users/${uid}`,
    `employee_links/${uid}`,
    `role_assignments/${encodeURIComponent(email)}`,
  ]) {
    await fetch(`${FIRESTORE}/${path}`, { method: 'DELETE', headers }).catch(() => {});
  }
}

test.describe('creating an account for a colleague', () => {
  test('the form never offers the admin role', async ({ page }) => {
    // The restriction that matters most, and the cheapest to regress: `admin`
    // is granted afterwards by an existing admin on an existing profile, never
    // handed out at creation. firestore.rules refuses it and INVITABLE_ROLES
    // refuses it; this asserts the form does not present it either, because a
    // control that is offered and then rejected reads as a broken product
    // rather than a deliberate boundary.
    await signIn(page, PERSONAS.admin);
    const dialog = await openCreateAccount(page);

    const role = dialog.getByLabel('Role');
    await expect(role).toBeVisible();

    const offered = await role.locator('option').allTextContents();
    expect(offered.map((o) => o.trim())).toEqual(INVITABLE_LABELS);
    expect(offered.join(' ').toLowerCase()).not.toContain('admin');

    // And it says so, rather than leaving the absence to be inferred.
    await expect(dialog.getByText(/Admin is not granted here/i)).toBeVisible();
  });

  test('the organisation is never a field on the form', async ({ page }) => {
    // The stamp is the inviter's own org, taken from their profile — an
    // administrator choosing a tenant from a dropdown is precisely how an
    // account ends up in the wrong one.
    await signIn(page, PERSONAS.admin);
    const dialog = await openCreateAccount(page);

    await expect(dialog.getByText('For someone in your organisation.')).toBeVisible();
    await expect(dialog.getByLabel(/organisation|organization|tenant|company/i)).toHaveCount(0);
  });

  test('an email address is required before the account can be created', async ({ page }) => {
    await signIn(page, PERSONAS.admin);
    const dialog = await openCreateAccount(page);

    const submit = dialog.getByRole('button', { name: 'Create account' });
    await expect(submit).toBeDisabled();

    await dialog.getByLabel('Full name').fill('No Address');
    await expect(submit).toBeDisabled();

    await dialog.getByLabel('Work email').fill('someone@example.com');
    await expect(submit).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // The creation itself. Opt-in — see the header.
  // -------------------------------------------------------------------------
  test('creating an account shows a one-time password and links the employee', async ({ page }) => {
    test.skip(
      process.env.E2E_ALLOW_ACCOUNT_CREATION !== '1',
      'provisions a real Firebase Auth account in the production project; set E2E_ALLOW_ACCOUNT_CREATION=1',
    );
    // The read-only tests above are worth running on every engine. This one
    // creates an account, and creating the same account three times over is not
    // three times the coverage — the engine has no bearing on what Firebase
    // stores. Chromium carries it.
    test.skip(
      test.info().project.name !== 'app',
      'account creation runs once, on Chromium, not once per engine',
    );

    // Unique per run: an address that already has an account is refused, and a
    // shared one would make two concurrent runs fight.
    const email = `e2e-invitee-${Date.now()}@modcon-hr.test`;
    let tempPassword = '';
    let uid = '';

    try {
      await signIn(page, PERSONAS.admin);
      const dialog = await openCreateAccount(page);

      await dialog.getByLabel('Full name').fill('E2E Invitee');
      await dialog.getByLabel('Work email').fill(email);
      await dialog.getByLabel('Role').selectOption('employee');
      await dialog.getByRole('button', { name: 'Create account' }).click();

      // The password is shown once, in the response, and nowhere else.
      const shown = dialog.locator('code');
      await expect(shown).toBeVisible({ timeout: 30_000 });
      tempPassword = (await shown.innerText()).trim();
      expect(tempPassword.length).toBeGreaterThanOrEqual(12);

      // Stated plainly rather than implying a mail flow that does not exist:
      // there is no email delivery in this app, so the inviter passes it on.
      await expect(dialog.getByText(/Shown once — nothing emails it/i)).toBeVisible();

      // It is a working credential, which is the only thing that makes handing
      // it over meaningful.
      const theirToken = await idTokenFor(email, tempPassword);
      expect(theirToken, 'the temporary password should sign the new account in').toBeTruthy();

      // Read the profile back as the new account itself: it is stamped with an
      // organisation, carries the role that was chosen, and — the point of the
      // "shown once" claim — does not store the password anywhere on it.
      const lookup = await fetch(`${IDENTITY}:lookup?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: theirToken }),
      });
      uid = ((await lookup.json()) as { users?: { localId: string }[] }).users?.[0]?.localId ?? '';
      expect(uid).toBeTruthy();

      const profileRes = await fetch(`${FIRESTORE}/users/${uid}`, {
        headers: { Authorization: `Bearer ${theirToken}` },
      });
      expect(profileRes.status, 'the new account should be able to read its own profile').toBe(200);
      const fields = ((await profileRes.json()) as { fields?: Record<string, unknown> }).fields ?? {};

      expect(fields.orgId, 'the account must be stamped with an organisation').toBeTruthy();
      expect((fields.role as { stringValue?: string })?.stringValue).toBe('employee');
      expect((fields.superAdmin as { booleanValue?: boolean })?.booleanValue ?? false).toBe(false);

      // Nothing on the document is the password, under any field name.
      expect(JSON.stringify(fields)).not.toContain(tempPassword);
      expect(Object.keys(fields).join(' ').toLowerCase()).not.toMatch(/password/);
    } finally {
      if (tempPassword && uid) await cleanUp(email, tempPassword, uid);
    }
  });
});
