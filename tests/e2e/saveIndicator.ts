import { expect, type Page } from '@playwright/test';

/**
 * Wait for a Settings save to reach the organisation — and fail if it did not.
 *
 * Every section on the Settings page writes localStorage synchronously and
 * publishes to Firestore afterwards, reporting the outcome through
 * `SaveIndicator` (src/pages/settings/index.tsx): "Saving…" while in flight,
 * "Saved" once the write lands, and "Not saved to your organisation" when it
 * was refused.
 *
 * ## Why this is not `getByText('Saved')`
 *
 * `getByText` defaults to `exact: false`, which is a **case-insensitive
 * substring** match — and "Not **saved** to your organisation" contains
 * "saved". So the obvious spelling is satisfied by the refusal indicator as
 * much as by the success one, and a helper documented as "wait for the write to
 * be acknowledged" returned just as happily when the write was refused.
 *
 * That is not a cosmetic imprecision. A refused publish is rolled back by
 * Firestore, the rollback arrives as a snapshot, and startOrgSettingsSync
 * hydrates localStorage from the organisation's unchanged copy — so the edit is
 * undone on this machine too, seconds later. A spec that sailed past the
 * refusal then failed further down on a value that had "never reached the
 * organisation", naming a symptom several assertions away from the cause. It
 * cost a full-matrix run: the failure skipped the eleven serial tests behind it
 * and, through the project dependency edge, every org-isolation test as well.
 *
 * `exact: true` also stops it matching Company Profile's "Saved!" — a second
 * section's indicator standing in for the one under test.
 *
 * Waiting for *either* terminal state before judging it is what makes a refusal
 * legible: a bare wait for success would spend the whole timeout and then
 * report only that "Saved" never appeared.
 */
const SAVED = 'Saved';
const REFUSED = 'Not saved to your organisation';

export async function expectPublished(page: Page): Promise<void> {
  // Either terminal state ends the wait — "Saving…" is neither.
  await expect(
    page.getByText(SAVED, { exact: true }).or(page.getByText(REFUSED)),
  ).toBeVisible({ timeout: 20_000 });

  await expect(
    page.getByText(REFUSED),
    'the publish was refused — the edit never reached the organisation',
  ).toHaveCount(0);
}
