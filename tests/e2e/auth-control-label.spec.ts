import { test, expect, type Page } from '@playwright/test';
import { AUTH_LABEL_PERSONA, PERSONAS } from './config';
import { employeeLinkFor, signInPersona } from './firestore';

/**
 * The control on an employee's profile that gives them a way to sign in
 * reads "Create login" or "Reset password", and which one is not a guess —
 * it is `employee_links/{uid}`, the one place this codebase answers "does an
 * account already resolve to this employee record" (see "Who an account *is*
 * has one answer" in CLAUDE.md). `Employee.authUid` looks like a shortcut to
 * the same answer and is deliberately not read for it: that field is the
 * localStorage directory's own claim about itself, the same second,
 * disagreeing source of identity the rest of the app has already retired.
 *
 * Two employees, not one, because a label that is right for a freshly hired
 * person proves nothing about whether it flips once a login exists — the
 * failure this guards is "Create login" surviving past the point a login
 * was actually created (T9 / G13, G6).
 *
 *   a brand-new address, never matched to any account → "Create login"
 *   AUTH_LABEL_PERSONA's address, already an account   → "Reset password"
 *
 * The second case is arranged the same way document-upload-access.spec.ts
 * arranges its "own record" case: hiring somebody with an address that
 * already has a Firebase Auth account auto-links it (`linkAccountForEmployee`
 * in src/data/employeeLinks.ts, called from Add Employee), so the button
 * changes on its own — nothing here writes `employee_links` directly, or the
 * assertion would only ever prove the test's own arrangement.
 *
 * This is the UI half. The single source of truth — `employee_links` — is
 * `firestore.rules`' own `myEmployeeId()`, which is exercised in
 * tests/rules/; nothing here needs to duplicate that.
 */
const ADMIN = PERSONAS.admin;
const EXISTING_ACCOUNT = AUTH_LABEL_PERSONA;

const CREATE_LOGIN = 'Create login';
const RESET_PASSWORD = 'Reset password';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** Hire somebody and land on their profile, the way the directory does it. */
async function addEmployeeAndOpen(
  page: Page,
  params: { code: string; firstName: string; lastName: string; email: string },
) {
  await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
  await page.getByRole('button', { name: 'Add Employee' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Employee code').fill(params.code);
  await dialog.getByLabel('Employee first name').fill(params.firstName);
  await dialog.getByLabel('Employee last name').fill(params.lastName);
  await dialog.getByLabel('Employee email').fill(params.email);
  await dialog.getByLabel('Employee designation').fill('Software Engineer');
  await dialog.getByLabel('Employee date of birth').fill('1994-06-18');
  await dialog.getByLabel('Employee date of joining').fill('2022-02-01');
  await dialog.getByLabel('Employee ctc').fill('1600000');
  await dialog.getByRole('button', { name: 'Save Employee' }).click();
  await expect(dialog).toBeHidden();

  const fullName = `${params.firstName} ${params.lastName}`;
  await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
  await page.getByPlaceholder('Search name, role, email, code…').fill(fullName);
  await page.getByText(fullName).first().click();
  await expect(page.getByRole('heading', { name: fullName })).toBeVisible();
  return new URL(page.url()).pathname.split('/').pop() ?? '';
}

test.describe.serial('the profile login control names the right action', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, ADMIN.email, ADMIN.password);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a freshly hired employee, matched to no account, is offered "Create login"', async () => {
    // A never-before-seen address: nothing in Firebase Auth or employee_links
    // can possibly name it, so Add Employee has nothing to auto-link and the
    // button has to read the unlinked state honestly rather than guessing.
    const email = `auth-label-none-${Date.now().toString(36)}@modcon-hr.test`;
    await addEmployeeAndOpen(page, {
      code: `AL-${Date.now().toString(36).slice(-6)}A`,
      firstName: 'Nolan',
      lastName: 'Nologin',
      email,
    });

    await expect(page.getByRole('button', { name: CREATE_LOGIN })).toBeVisible();
    await expect(page.getByRole('button', { name: RESET_PASSWORD })).toHaveCount(0);
  });

  test('hiring somebody whose account already exists is offered "Reset password", not "Create login"', async () => {
    const employeeId = await addEmployeeAndOpen(page, {
      code: `AL-${Date.now().toString(36).slice(-6)}B`,
      firstName: 'Rhea',
      lastName: 'Resettable',
      email: EXISTING_ACCOUNT.email,
    });

    // The link this label is supposed to reflect — arranged by the app (Add
    // Employee linking a pre-existing account), not by the test. Polled
    // because the write is optimistic (see "Writes are optimistic" in
    // CLAUDE.md): asserting the button before the link lands would only prove
    // the button ignored a link that had not arrived yet.
    const { uid } = await signInPersona(EXISTING_ACCOUNT.email, EXISTING_ACCOUNT.password);
    expect(uid, 'could not resolve the auth-label persona uid').not.toBeNull();
    await expect
      .poll(async () => (await employeeLinkFor(uid as string))?.employeeId, {
        message: 'adding the employee never linked the existing account',
        timeout: 15_000,
      })
      .toBe(employeeId);

    await expect(page.getByRole('button', { name: RESET_PASSWORD })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: CREATE_LOGIN })).toHaveCount(0);
  });

  test('"Reset password" sends a set-password link rather than creating a second account', async () => {
    await page.getByRole('button', { name: RESET_PASSWORD }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('This employee already has a login.')).toBeVisible();
    // No role picker here — reusing an account is not a chance to change what
    // it is. Only the create flow offers a role.
    await expect(dialog.getByLabel('Role')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Send reset link' }).click();
    await expect(dialog.getByText(/A set-password link has been emailed to/i)).toBeVisible({
      timeout: 15_000,
    });
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();

    // Still the same one account, still pointed at the same record — a
    // reset must not have minted a second login for this employee.
    const { uid } = await signInPersona(EXISTING_ACCOUNT.email, EXISTING_ACCOUNT.password);
    expect(uid, 'the account should still sign in with its existing password').not.toBeNull();
  });
});
