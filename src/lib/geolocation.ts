/**
 * Reading a position out of the browser.
 *
 * One seam, so that every surface which captures a location captures the same
 * fields with the same options — and so the E2E suite has a single thing to
 * override. `navigator.geolocation` is stubbed per-context in
 * tests/e2e/geolocation.ts; Playwright's own `context.setGeolocation` supplies
 * only latitude, longitude and accuracy, which is not enough to exercise the
 * integrity signals.
 *
 * `enableHighAccuracy` is on because a fence a few hundred metres across is
 * exactly the scale at which the coarse provider stops being able to answer:
 * a wifi fix reporting ±1 km cannot place anybody inside a 200 m circle, and
 * would be refused by `maxAccuracyMetres` anyway. Better to spend the battery
 * and the two seconds.
 *
 * `maximumAge: 0` because a cached fix is precisely what should not count as
 * evidence of being somewhere now.
 */
import type { LocationFix } from '@/data/geofenceRules';

export type GeolocationFailure =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'timeout';

export interface GeolocationResult {
  fix: LocationFix | null;
  failure: GeolocationFailure | null;
}

const TIMEOUT_MS = 15_000;

/** Human wording for why no position was captured. */
export function describeGeolocationFailure(failure: GeolocationFailure): string {
  switch (failure) {
    case 'denied':
      return 'Location access is blocked for this site. Allow it in your browser’s site settings and try again.';
    case 'unavailable':
      return 'Your device could not determine a position. Move somewhere with a clearer signal and try again.';
    case 'timeout':
      return 'Your device took too long to find a position. Try again in a moment.';
    case 'unsupported':
    default:
      return 'This browser cannot report a location.';
  }
}

/**
 * Capture one position.
 *
 * Never rejects: a refused or unavailable position is an ordinary outcome that
 * the caller has to record rather than an error to swallow, and the difference
 * between "denied" and "unavailable" is the difference between a browser
 * setting the employee can fix and a signal problem they cannot.
 */
export function captureLocationFix(): Promise<GeolocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ fix: null, failure: 'unsupported' });
  }

  return new Promise<GeolocationResult>((resolve) => {
    let settled = false;
    const finish = (result: GeolocationResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const c = position.coords;
        finish({
          fix: {
            lat: c.latitude,
            lng: c.longitude,
            // Some platforms report accuracy as null despite the type. A fix
            // that will not say how wrong it might be is treated as the worst
            // case rather than the best, so `maxAccuracyMetres` refuses it.
            accuracyMetres:
              typeof c.accuracy === 'number' && Number.isFinite(c.accuracy)
                ? c.accuracy
                : Number.POSITIVE_INFINITY,
            capturedAtMs: position.timestamp,
            receivedAtMs: Date.now(),
            altitudeMetres: c.altitude ?? null,
            speedMetresPerSecond: c.speed ?? null,
            headingDegrees: c.heading ?? null,
          },
          failure: null,
        });
      },
      (error) => {
        const failure: GeolocationFailure =
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        finish({ fix: null, failure });
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

/**
 * Whether the browser has already been granted location, without asking.
 *
 * Used only to word the button — "Check In" versus "Check In (asks for your
 * location)" — so a `prompt` state is not a problem to solve, it is a sentence
 * to write. The Permissions API is absent on some browsers, hence `unknown`.
 */
export async function locationPermissionState(): Promise<
  'granted' | 'denied' | 'prompt' | 'unknown'
> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}
