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
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/modconhr-b2789/databases/(default)/documents';

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
 * Undo a creation.
 *
 * Two channels, because the two halves live in different places and only one of
 * them has a quota that runs out. The profile document is removed through the
 * Admin dashboard's own "Remove from directory" control — the Firestore **SDK**,
 * the same path the product uses — and the Auth account through
 * identitytoolkit, with its own token, which is why that has to happen while
 * the temporary password still works.
 *
 * Deliberately not the Firestore REST API for the profile. That was the first
 * version and it is the wrong dependency: REST carries a separate daily quota
 * from the SDK, and when it is exhausted (HTTP 429) the *cleanup* silently
 * stops working while the *creation* carries on fine — so the failure mode is
 * an accumulating pile of real accounts in a real project, which is exactly
 * what this function exists to prevent. REST is kept only as a best-effort
 * sweep for `role_assignments`, which has no UI.
 *
 * Every step is best-effort: a failure here must not mask the assertion the
 * test was actually making.
 */
async function cleanUp(page: Page, email: string, tempPassword: string): Promise<string[]> {
  const leaked: string[] = [];

  // 1. The profile, through the product.
  try {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/admin');
    const row = page.getByRole('row').filter({ hasText: email });
    // Wait for the row, do not count it.
    //
    // This is what leaked two real accounts into the production project. The
    // first version asked `if (await row.count())` — and `count()` does not
    // wait. The `goto` above tears down and re-establishes the directory's
    // Firestore subscription, so at that instant the table is always empty:
    // the check read zero every single time, concluded there was nothing to
    // remove, and skipped the removal entirely. Silently, because the whole
    // block was wrapped in a bare catch.
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: 'Remove from directory' }).click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  } catch (err) {
    leaked.push(`users profile for ${email} (${String(err).slice(0, 100)})`);
  }

  // 2. The Auth account, with its own credential.
  if (!tempPassword) {
    leaked.push(`auth account for ${email} (no temporary password captured)`);
  } else {
    const theirs = await idTokenFor(email, tempPassword);
    if (theirs) {
      const res = await fetch(`${IDENTITY}:delete?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: theirs }),
      }).catch(() => null);
      if (!res?.ok) leaked.push(`auth account for ${email}`);
    } else {
      leaked.push(`auth account for ${email} (could not sign in to delete it)`);
    }
  }

  // 3. `role_assignments` has no UI, so this is the one thing that still needs
  //    the REST API. Best-effort by necessity: when REST is quota-exhausted the
  //    document survives, which is inert — the account it names is gone, and
  //    adoption is org-checked — but it is reported rather than assumed.
  const admin = await idTokenFor(PERSONAS.admin.email, PERSONAS.admin.password);
  if (admin) {
    const res = await fetch(`${FIRESTORE}/role_assignments/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin}` },
    }).catch(() => null);
    if (!res?.ok) leaked.push(`role_assignments/${email} (HTTP ${res?.status ?? 'no response'})`);
  }

  return leaked;
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

      // The linking outcome is always reported — either the employee record it
      // matched, or why it matched none. A silent non-link is how an account
      // ends up unable to see its own payslips with nobody aware of it.
      await expect(
        dialog.getByText(/Linked to employee record|Until it is linked/i),
      ).toBeVisible();

      await dialog.getByRole('button', { name: 'Done' }).click();

      // It is a working credential, which is the only thing that makes handing
      // it over meaningful.
      const theirToken = await idTokenFor(email, tempPassword);
      expect(theirToken, 'the temporary password should sign the new account in').toBeTruthy();

      // The profile landed, with the role that was chosen and not a higher one.
      // Read back through the product rather than around it: the Admin
      // dashboard's directory is a live Firestore subscription, and it is
      // org-scoped, so the row appearing here at all is also the evidence that
      // the account was stamped with the inviter's organisation — an unstamped
      // or foreign-stamped account is filtered out of this very list.
      const row = page.getByRole('row').filter({ hasText: email });
      await expect(row).toBeVisible({ timeout: 30_000 });
      // The Role *cell*, not the row: the row also holds the role `<select>`,
      // whose options include every role a platform admin may assign — "Admin"
      // among them. Asserting over the whole row would either match a hidden
      // <option> or read the presence of that option as a granted role.
      await expect(row.getByRole('cell').nth(1)).toHaveText('Employee');
    } finally {
      // Always, not `if (tempPassword)`: the account may exist even when the
      // test failed before it could read the password back, and that is exactly
      // when a leak is least likely to be noticed.
      const leaked = await cleanUp(page, email, tempPassword);
      if (leaked.length) {
        // Reported, never swallowed. Anything left here is a real account in a
        // real Firebase project, and the previous version discarded the failure
        // — which is how two of them ended up in production before anyone
        // looked. Logged unconditionally, and failed only when the test would
        // otherwise have passed, so this cannot mask the original error.
        console.error(`[provisioning] CLEANUP LEAK: ${leaked.join(' | ')}`);
        if (test.info().errors.length === 0) {
          throw new Error(`cleanup left data behind in production: ${leaked.join(' | ')}`);
        }
      }
    }
  });
});
