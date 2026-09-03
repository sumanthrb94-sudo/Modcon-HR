import type { Page } from '@playwright/test';

/**
 * A controllable `navigator.geolocation` for one page.
 *
 * Playwright's own `context.setGeolocation` supplies latitude, longitude and
 * accuracy and nothing else — no altitude, no speed, no heading, and no control
 * over `position.timestamp`. Those are exactly the fields the integrity signals
 * in src/data/geofenceRules.ts read, so the built-in cannot exercise the half of
 * this feature that matters. It also cannot distinguish a *refused* permission
 * from an unavailable position, which are different sentences to the employee
 * and different outcomes on the stamp.
 *
 * The stub is installed once as an init script and reads its answer out of
 * localStorage on every call. That indirection is the point: `addInitScript`
 * captures its argument at install time and re-runs on every navigation, so a
 * per-test position passed that way would either be fixed for the whole context
 * or reset by the next `goto`. Reading at call time lets one signed-in page —
 * and these specs need exactly one, because the account's link to an employee
 * record lives in that context's localStorage — walk through several positions.
 */
const KEY = 'modcon.e2e.geolocationFix';

export interface StubbedFix {
  lat: number;
  lng: number;
  accuracyMetres?: number;
  altitudeMetres?: number | null;
  speedMetresPerSecond?: number | null;
  headingDegrees?: number | null;
  /** Subtracted from `position.timestamp`, for the stale-fix signal. */
  ageMs?: number;
}

/** Install the stub. Call once per page, before the first navigation. */
export async function installGeolocationStub(page: Page): Promise<void> {
  await page.addInitScript((storageKey: string) => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };

    const geolocation = {
      getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback) {
        const f = read();
        if (!f || f.denied) {
          error?.({
            code: 1,
            message: 'User denied Geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
          return;
        }
        success({
          coords: {
            latitude: f.lat as number,
            longitude: f.lng as number,
            accuracy: (f.accuracyMetres as number) ?? 12,
            altitude: (f.altitudeMetres as number) ?? 920,
            altitudeAccuracy: 10,
            heading: (f.headingDegrees as number) ?? null,
            speed: (f.speedMetresPerSecond as number) ?? 0,
            toJSON() { return this; },
          },
          timestamp: Date.now() - ((f.ageMs as number) ?? 0),
          toJSON() { return this; },
        } as GeolocationPosition);
      },
      watchPosition() { return 0; },
      clearWatch() {},
    };
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
  }, KEY);
}

/** What the stub answers with from now on. */
export async function setFix(page: Page, fix: StubbedFix): Promise<void> {
  await page.evaluate(
    ([storageKey, value]) => window.localStorage.setItem(storageKey as string, value as string),
    [KEY, JSON.stringify(fix)],
  );
}

/** Refuse the position, the way a browser does when the site is blocked. */
export async function setDenied(page: Page): Promise<void> {
  await page.evaluate(
    ([storageKey, value]) => window.localStorage.setItem(storageKey as string, value as string),
    [KEY, JSON.stringify({ denied: true })],
  );
}
