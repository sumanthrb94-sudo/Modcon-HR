import { test, expect, type Page } from '@playwright/test';
import { HR_PERSONA, PERSONAS } from './config';
import { employeeLinkFor, signInPersona } from './firestore';

/**
 * Assigning work, and tracking your own.
 *
 * This is the client half. What it can show is that the controls appear for the
 * right people and that an assignment round-trips through Firestore to the
 * person it was for; what it cannot show is that a colleague is refused, since
 * the page never asks for anything it thinks it cannot have. That is
 * tests/rules/tasks.rules.test.mjs, which is where the access-control claims
 * live.
 *
 * Runs in the org-settings project rather than the app project: it writes to
 * the shared `tasks` collection, and the app project runs on three engines,
 * which would be three concurrent writers assigning the same work.
 */
const ADMIN = PERSONAS.admin;
const EMPLOYEE = PERSONAS.employee;

const TASK_TITLE = 'E2E — reconcile the vendor ledger';
const CLIENT_NAME = 'Priya Shah';
const CLIENT_COMPANY = 'Acme Ltd';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Select the option whose text contains `text`.
 *
 * Playwright's `selectOption({ label })` takes an exact string, and these
 * options carry a generated designation after the name — so matching on the
 * name alone needs the value looked up rather than guessed.
 */
async function selectByText(select: ReturnType<Page['getByLabel']>, text: string) {
  const value = await select.locator('option').filter({ hasText: text }).first().getAttribute('value');
  expect(value, `no option containing "${text}"`).toBeTruthy();
  await select.selectOption(value as string);
}

async function signOut(page: Page) {
  await page.locator('button[title="Sign out"]').click();
  await expect(page.locator('#username')).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('tasks are assigned and tracked', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, ADMIN.email, ADMIN.password);

    // The employee persona needs a record of its own to be assigned work, and
    // an employee_links document for the rules to resolve "my tasks" — which
    // adding them to the directory now writes. Asserted, not arranged: the app
    // is what has to do it.
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Add Employee' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Employee first name').fill('Task');
    await dialog.getByLabel('Employee last name').fill('Doer');
    await dialog.getByLabel('Employee email').fill(EMPLOYEE.email);
    await dialog.getByLabel('Employee designation').fill('Software Engineer');
    await dialog.getByLabel('Employee date of birth').fill('1995-04-12');
    await dialog.getByLabel('Employee date of joining').fill('2021-04-01');
    await dialog.getByLabel('Employee ctc').fill('1800000');
    await dialog.getByRole('button', { name: 'Save Employee' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    const { uid } = await signInPersona(EMPLOYEE.email, EMPLOYEE.password);
    await expect
      .poll(async () => (await employeeLinkFor(uid as string))?.employeeId, { timeout: 15_000 })
      .toBeTruthy();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('an administrator assigns work, and records who asked for it', async () => {
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Assign Task' }).click();
    const dialog = page.getByRole('dialog');
    await selectByText(dialog.getByLabel('Task assignee'), 'Task Doer');
    await dialog.getByLabel('Task title').fill(TASK_TITLE);
    await dialog.getByLabel('Task details').fill('Match the August statements.');
    await dialog.getByLabel('Task priority').selectOption('High');
    // The client half of the request: recorded on the task, no account.
    await dialog.getByLabel('Requested by name').fill(CLIENT_NAME);
    await dialog.getByLabel('Requested by company').fill(CLIENT_COMPANY);
    await dialog.getByRole('button', { name: 'Assign Task' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.getByRole('button', { name: /^All Tasks/ }).click();
    await expect(page.getByTestId('task-row').filter({ hasText: TASK_TITLE })).toBeVisible({ timeout: 20_000 });
  });

  test('an employee sees it, with who asked for it, and moves it along', async () => {
    await signOut(page);
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 20_000 });

    const row = page.getByTestId('task-row').filter({ hasText: TASK_TITLE });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(CLIENT_COMPANY);

    // Tracking their own work means acting on it, not only reading it.
    await page.getByLabel(`Status of ${TASK_TITLE}`).selectOption('In Progress');
    await expect
      .poll(async () => await page.getByLabel(`Status of ${TASK_TITLE}`).inputValue(), { timeout: 15_000 })
      .toBe('In Progress');
  });

  test('an employee is not offered the assign control at all', async () => {
    // They have nobody reporting to them, so there is nobody they could assign
    // to. toHaveCount(0) rather than not.toBeVisible: a control rendered off
    // screen satisfies the latter too.
    await expect(page.getByRole('button', { name: 'Assign Task' })).toHaveCount(0);
  });

  test('the change is what the administrator sees too', async () => {
    await signOut(page);
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/tasks');
    await page.getByRole('button', { name: /^All Tasks/ }).click();
    const row = page.getByTestId('task-row').filter({ hasText: TASK_TITLE });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('row').filter({ hasText: TASK_TITLE })).toContainText('In Progress');
  });

  test('and can be withdrawn by whoever raised it', async () => {
    await page.getByRole('row').filter({ hasText: TASK_TITLE }).getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByTestId('task-row').filter({ hasText: TASK_TITLE })).toHaveCount(0, { timeout: 20_000 });
  });
});

test.describe.serial('HR starts an onboarding', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, HR_PERSONA.email, HR_PERSONA.password);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a new hire can be put on the standard checklist', async () => {
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: 'Onboarding' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Start Onboarding' }).click();
    const dialog = page.getByRole('dialog');
    await selectByText(dialog.getByLabel('Onboarding employee'), 'Riya Sharma');
    await dialog.getByLabel('Onboarding start date').fill('2026-08-10');
    await dialog.getByLabel('Onboarding buddy').fill('Sneha Patil');
    await dialog.getByRole('button', { name: 'Start Onboarding' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText('Riya Sharma').first()).toBeVisible();
  });

  test('and counts as one in progress before any task is ticked', async () => {
    // The card required progress > 0, so a hire on day one — the clearest case
    // of an onboarding in progress — was counted as none at all.
    const card = page.getByText('Onboarding In Progress').locator('..');
    await expect(card).not.toContainText(/\b0\b/);
  });
});
