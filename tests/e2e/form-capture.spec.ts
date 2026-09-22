import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Forms must capture a genuinely filled input on the FIRST submit, and a
 * rejected submit must say which field is wrong.
 *
 * Add Asset's Category `<Select>` had no placeholder option, so its rendered
 * `<option>` list had nothing matching the form's initial `''` state. A
 * browser `<select>` with no option explicitly marked `selected` defaults to
 * showing its *first* option — here, the first real category — so the field
 * looked pre-filled from the moment the dialog opened. A person who left it
 * at that (entirely reasonable, since it already showed a category) or who
 * explicitly picked that same first-looking category submitted a form that
 * *looked* complete and was rejected anyway, because the browser's default
 * selection is not a `change` event: nothing ever told React the value was
 * "Laptop", and `form.category` stayed `''` underneath. Selecting that exact
 * first option is therefore the one interaction that reproduces the bug — a
 * different category would be a genuine value change and would have worked
 * even before the fix. `tests/e2e/persistence.spec.ts` happens to pick the
 * *second* option for an unrelated reason and so never exercised this path.
 *
 * Post a Job's `<Select>`s were already wired correctly; its bug was that a
 * missing required field failed `handleSubmit`'s guard clause and returned
 * with nothing on screen — the click looked like it did nothing.
 */

async function login(page: Page, persona: (typeof PERSONAS)['admin']) {
  await page.goto('/login');
  await page.locator('#username').fill(persona.email);
  await page.locator('#password').fill(persona.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

const stamp = `${Date.now().toString(36)}`;

test.describe.serial('Add Asset captures input on the first submit', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, PERSONAS.admin);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a genuinely filled form, including the category the dialog already shows, is saved on the first click', async () => {
    const assetName = `Form Capture Asset ${stamp}`;

    await page.getByRole('link', { name: 'Assets', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add Asset' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add New Asset' })).toBeVisible();

    await dialog.getByPlaceholder('e.g. MacBook Pro 14').fill(assetName);
    await dialog.getByPlaceholder('e.g. SN-2026-0001').fill(`SN-${stamp}`);
    await dialog.getByPlaceholder('e.g. 85000').fill('12345');

    // The category a browser shows by default with no placeholder option is
    // its first real one — reselecting that exact value is the interaction
    // that never reached React before the fix (no DOM value change, so no
    // `change` event). Any other category would have worked regardless.
    const categorySelect = dialog.locator('select').first();
    const firstCategoryOption = categorySelect.locator('option').nth(1);
    const firstCategoryLabel = ((await firstCategoryOption.textContent()) ?? '').trim();
    const firstCategoryValue = (await firstCategoryOption.getAttribute('value')) as string;
    await categorySelect.selectOption(firstCategoryValue);
    await expect(categorySelect).toHaveValue(firstCategoryValue);

    // One click. A test that clicked, saw the rejection, fixed the category
    // and clicked again would pass whether or not the binding was ever fixed.
    await dialog.getByRole('button', { name: 'Add Asset' }).click();

    await expect(dialog).toBeHidden();
    const row = page.getByRole('row', { name: new RegExp(assetName) });
    await expect(row).toBeVisible();
    await expect(row.getByText(firstCategoryLabel, { exact: true })).toBeVisible();
  });

  test('submitting without a category names Category, not a generic message', async () => {
    const assetName = `Form Capture Rejected ${stamp}`;

    await page.getByRole('button', { name: 'Add Asset' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add New Asset' })).toBeVisible();

    await dialog.getByPlaceholder('e.g. MacBook Pro 14').fill(assetName);
    await dialog.getByPlaceholder('e.g. SN-2026-0001').fill(`SN-reject-${stamp}`);
    await dialog.getByPlaceholder('e.g. 85000').fill('999');
    // Category is deliberately left untouched.

    await dialog.getByRole('button', { name: 'Add Asset' }).click();

    // Rejected, and the dialog says which field — not one line reading
    // "Please fill all required fields" while every visible field looks full.
    await expect(dialog.getByText('Category is required.')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Add New Asset' })).toBeVisible();
    await expect(page.getByText(assetName)).toBeHidden();

    await page.keyboard.press('Escape');
  });
});

test.describe.serial('Post a Job captures input and names a missing field', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, PERSONAS.admin);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a fully filled form posts on the first click', async () => {
    const jobTitle = `Form Capture Role ${stamp}`;

    await page.getByRole('link', { name: 'Recruitment', exact: true }).first().click();
    await page.getByRole('button', { name: 'Post a Job' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Post a New Job' })).toBeVisible();

    await dialog.getByPlaceholder('e.g. Senior Software Engineer').fill(jobTitle);

    const [deptSelect, locationSelect] = await dialog.locator('select').all();
    const deptValue = (await deptSelect.locator('option').nth(1).getAttribute('value')) as string;
    await deptSelect.selectOption(deptValue);
    const locationValue = (await locationSelect.locator('option').nth(1).getAttribute('value')) as string;
    await locationSelect.selectOption(locationValue);

    // Not the fix under test — skip the extra Firestore publish write.
    const publishCheckbox = dialog.getByRole('checkbox');
    if (await publishCheckbox.isChecked()) await publishCheckbox.uncheck();

    // One click.
    await dialog.getByRole('button', { name: 'Post Job' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: jobTitle })).toBeVisible();
  });

  test('submitting with department and location blank names both fields', async () => {
    const jobTitle = `Form Capture Rejected Role ${stamp}`;

    await page.getByRole('button', { name: 'Post a Job' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Post a New Job' })).toBeVisible();

    await dialog.getByPlaceholder('e.g. Senior Software Engineer').fill(jobTitle);
    // Department and Location deliberately left at their placeholders.

    await dialog.getByRole('button', { name: 'Post Job' }).click();

    // The old behaviour was a silent early return: the click did nothing and
    // nothing on screen explained why.
    await expect(dialog.getByText('Department is required.')).toBeVisible();
    await expect(dialog.getByText('Location is required.')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Post a New Job' })).toBeVisible();
    await expect(page.getByRole('heading', { name: jobTitle })).toBeHidden();

    await page.keyboard.press('Escape');
  });
});
