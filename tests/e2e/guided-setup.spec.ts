import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken, listOrgRecords } from './firestore';

/**
 * The guided setup (`/setup`) brings a team in from a spreadsheet.
 *
 * What is worth proving end to end is the import: that a pasted CSV is read,
 * that a row it cannot use is listed rather than dropped, and that the people
 * it can use are created through `createEmployeeFromDetails` and reach the
 * organisation's Firestore copy — not this browser's. The parsing itself is
 * covered line by line in tests/unit/employeeImport.test.ts.
 *
 * ## What this deliberately does not save
 *
 * The company and policy steps write `org_settings` documents that other specs
 * in this project rewrite concurrently — `hr-designations` the company
 * profile, `week-off-policy` the week off, `org-settings` the leave policy
 * list — and a stale whole-document write from here would make *their*
 * assertions fail on timing alone. So the company step is passed unchanged
 * (the page writes nothing when nothing changed) and the policy step is
 * checked for what it offers but not submitted. Both save through functions
 * the specs that own those documents already cover.
 *
 * Runs in the org-settings project because the people it creates are the
 * organisation's shared data; they are deleted again afterwards. Addresses are
 * unique to the run, and every lookup filters on them — the directory is shared
 * by every spec running at the same time.
 */

const ADMIN = PERSONAS.admin;
const RUN = Date.now().toString(36);
const GOOD = [`setup-e2e-a-${RUN}@example.com`, `setup-e2e-b-${RUN}@example.com`];
const BAD = `setup-e2e-bad-${RUN}@example.com`;

interface StoredEmployee {
  id: string;
  email: string;
  employeeCode: string;
  department: string;
  location: string;
  ctc: number;
  dateOfJoining: string;
  reportingManagerId: string | null;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'People & Documents' })).toBeVisible({ timeout: 20_000 });
}

async function imported(): Promise<StoredEmployee[]> {
  const everyone = await listOrgRecords<StoredEmployee>('employees');
  return everyone.filter((employee) => GOOD.includes(employee.email) || employee.email === BAD);
}

test.describe.serial('guided setup imports a team from a spreadsheet', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    // Best effort, and by REST: these are records this spec created, so
    // removing the documents restores the directory exactly. Absence is
    // "never there" for a non-seed record, so no tombstone is needed.
    try {
      const token = await adminToken();
      const people = await imported();
      await Promise.all(
        people.map((person) =>
          fetch(`${FIRESTORE_BASE}/org_records/default__employees__${person.id}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
        ),
      );
    } catch {
      // A failure here must not mask the failure that caused it.
    }
    await context?.close();
  });

  test('the company step opens on what is already saved', async () => {
    await page.goto('/setup');
    await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Company name')).not.toHaveValue('');
    // The go-live date defaults to today; cleared back to the demo
    // organisation's stored '' so this step stays a no-op write (see above).
    await page.getByLabel('Start recording attendance from').fill('');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  });

  test('HR is asked for their own details rather than given invented ones', async () => {
    // Whether the admin persona has a record depends on what other specs have
    // linked it to, so both states are accepted — but neither may carry the
    // figures an earlier version invented for an administrator with none.
    const step = page.locator('main');
    await expect(step.getByRole('heading', { name: 'About you' })).toBeVisible();
    if (await page.getByLabel('Your first name').isVisible()) {
      await expect(page.getByLabel('Your ctc')).toHaveValue('');
      await expect(page.getByLabel('Your date of birth')).toHaveValue('');
      await page.getByRole('button', { name: /Skip/ }).click();
    } else {
      await expect(step).toContainText('Nothing to do here');
      await page.getByRole('button', { name: /Continue/ }).click();
    }
    await expect(page.getByRole('heading', { name: 'Bring in your people' })).toBeVisible();
  });

  test('a pasted CSV is previewed, and the unusable row is named with its reason', async () => {
    // Columns in an order of their own, and an alias or two — the file is
    // whatever HR exported, not our template.
    const csv = [
      'Work Email,First Name,Last Name,Designation,Department,Location,DOB,DOJ,Annual CTC,Employee Code,Reporting Manager',
      `${GOOD[0]},Asha,Rao,Analyst,Finance,Bengaluru,12/03/1994,01/06/2023,"6,50,000",E2E-SU-${RUN}-1,`,
      `${GOOD[1]},Kiran,Das,Engineer,Engineering,Hyderabad,1990-11-05,2024-01-15,9 LPA,E2E-SU-${RUN}-2,${GOOD[0]}`,
      `${BAD},Nobody,Atall,Engineer,Engineering,Hyderabad,1990-11-05,2024-01-15,0,E2E-SU-${RUN}-3,`,
    ].join('\n');

    await page.getByText('Or paste the rows instead').click();
    await page.getByLabel('Employee CSV rows').fill(csv);

    await expect(page.getByText('2 people ready to add')).toBeVisible();
    await expect(page.getByText('1 row will not be added')).toBeVisible();
    await expect(page.getByText(/Line 4:.*above zero/)).toBeVisible();
  });

  test('the usable rows become the organisation’s people, and the refused one does not', async () => {
    await page.getByRole('button', { name: 'Add 2 people' }).click();
    await expect(page.getByRole('status')).toContainText('Added 2 people');

    // Against Firestore, not the page: the point is that the people outlive
    // this browser, which re-reading the directory here cannot show.
    await expect.poll(async () => (await imported()).length, { timeout: 15_000 }).toBe(2);
    const people = await imported();
    const asha = people.find((person) => person.email === GOOD[0]);
    expect(asha).toMatchObject({
      department: 'Finance',
      location: 'Bengaluru',
      ctc: 650000,
      dateOfJoining: '2023-06-01',
      employeeCode: `E2E-SU-${RUN}-1`,
    });
    expect(people.some((person) => person.email === BAD)).toBe(false);
    // The Reporting Manager column is read — Kiran's manager is Asha, who was
    // created by the same upload a line earlier — and "9 LPA" is ₹9,00,000.
    await expect.poll(async () => (await imported()).find((person) => person.email === GOOD[1])?.reportingManagerId, { timeout: 15_000 })
      .toBe(asha?.id);
    expect((await imported()).find((person) => person.email === GOOD[1])?.ctc).toBe(900000);
  });

  test('the policy step offers the templates with their figures', async () => {
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByRole('heading', { name: 'Week off and leave' })).toBeVisible();
    await expect(page.getByLabel('Weekly day off')).toBeVisible();
    await expect(page.getByText('Earn as you go')).toBeVisible();
    await expect(page.getByText('Full year up front')).toBeVisible();
    await expect(page.getByText('15 days a year, after 12 months')).toBeVisible();
    // The demo organisation has a policy of its own, so keeping it is offered
    // — and is what is selected, so pressing on would change nothing.
    await expect(page.getByLabel(/Keep the policy you already have/)).toBeChecked();
  });
});
