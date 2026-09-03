// ===========================================================================
// The arithmetic of a geofence: where the organisation's sites are, whether a
// captured position falls inside one, and what about that position looks
// falsified.
//
// This module imports nothing, and must go on importing nothing. It is the
// half of the geofenced-attendance feature that can be unit tested
// (`npm run test:unit`) under node's strip-types runner, which resolves
// neither the `@/*` alias nor firebase. Everything that reaches for storage —
// the org_settings registry, the localStorage cache, the change event — lives
// in data/attendanceGeofence.ts; everything that reaches for the browser's
// Geolocation API lives in lib/geolocation.ts; the Firestore evidence lives in
// lib/attendanceStamps.ts.
//
// WHAT THIS CAN AND CANNOT PROVE
//
// It can decide whether a *submitted* pair of coordinates lies inside a fence.
// `firestore.rules` recomputes exactly that from the stored fence, so a client
// cannot post a verdict its own coordinates contradict.
//
// It cannot decide whether the coordinates are *true*. No browser API can: the
// Geolocation API reports what the platform hands it, and on a rooted or
// developer-mode device that is whatever a mock-location app says. The signals
// in `assessIntegrity` are heuristics — they raise a flag for a human, and are
// deliberately never the thing that decides an employee is dishonest. What
// decides that is HR confirming it, which is why a flagged stamp goes to a
// review queue rather than to a punishment.
// ===========================================================================

/**
 * The furthest a fence may reach, in metres.
 *
 * A geofence exists to answer "is this person at work". Beyond a few hundred
 * metres it stops answering that: a 2 km fence around a city-centre office
 * covers a dozen cafés and somebody's flat. 500 m is the cap because it is
 * what was asked for, and because the honest failure of a too-tight fence
 * (a stamp refused indoors, which the employee can regularize) is much
 * cheaper than the failure of a too-loose one (a stamp accepted from home,
 * which nobody ever finds out about).
 */
export const MAX_GEOFENCE_RADIUS_METRES = 500;

/** The smallest fence worth drawing — below this, ordinary GPS error refuses everyone. */
export const MIN_GEOFENCE_RADIUS_METRES = 25;

/** Metres per degree of latitude. Constant enough at any latitude for this purpose. */
const METRES_PER_DEGREE_LAT = 110_574;

/** Metres per degree of longitude at the equator, narrowing towards the poles. */
const METRES_PER_DEGREE_LNG_EQUATOR = 111_320;

/**
 * A place the organisation accepts attendance from.
 *
 * `metresPerDegreeLng` is precomputed and stored rather than derived at
 * evaluation time, and that is not an optimisation. `firestore.rules` has no
 * trigonometry — no `cos`, no `sqrt` — so a rule cannot convert a longitude
 * delta into metres by itself. Storing the factor with the fence, written by
 * an organisation administrator and range-checked by the rules, is what lets
 * the server recompute the same verdict the client did using arithmetic
 * alone. See `squaredMetresBetween`.
 */
export interface GeofenceSite {
  /** Stable slug. Stamps reference the site by id, so renaming one keeps its history. */
  readonly id: string;
  /** What people call the place. Free text; matched to a work location by `locationName`. */
  readonly name: string;
  /**
   * The declared work location this fence belongs to, if any — the same string
   * `data/locations.ts` manages. Optional: a site can exist before anyone is
   * posted to it.
   */
  readonly locationName?: string;
  readonly lat: number;
  readonly lng: number;
  /** Between MIN_ and MAX_GEOFENCE_RADIUS_METRES. */
  readonly radiusMetres: number;
  /** Precomputed `metresPerDegreeLongitudeAt(lat)` — see the note on this interface. */
  readonly metresPerDegreeLng: number;
}

/**
 * What the organisation does with a stamp that fails the fence.
 *
 * `off`      — capture nothing. The feature is not in use.
 * `advisory` — capture, evaluate, record; never refuse. The stamp lands with
 *              its verdict attached and HR sees the pattern.
 * `enforced` — refuse the stamp outright.
 *
 * Advisory exists because enforcement on day one locks out everyone whose
 * office wifi geolocates 600 m down the road, and the organisation has no way
 * to discover that in advance. The intended path is to run advisory for a
 * fortnight, read the review queue, adjust the fences, then enforce.
 */
export type GeofenceMode = 'off' | 'advisory' | 'enforced';

/**
 * The organisation's geofencing configuration.
 *
 * `maxAccuracyMetres` is the worst fix that still counts as evidence. A
 * position reported as "somewhere within 3 km" cannot place anybody inside a
 * 200 m fence, and accepting it would mean the fence passes whoever has the
 * weakest signal.
 */
export interface GeofenceConfig {
  readonly mode: GeofenceMode;
  readonly sites: GeofenceSite[];
  readonly maxAccuracyMetres: number;
}

/** Nothing configured: the state a newly created organisation is in. */
export const EMPTY_GEOFENCE_CONFIG: GeofenceConfig = {
  mode: 'off',
  sites: [],
  maxAccuracyMetres: 120,
};

/**
 * Employees the fence does not apply to, by employee id.
 *
 * Sparse, and the same shape as every other per-employee exception in this app
 * (shifts, week-offs, leave entitlement). A construction company's site
 * engineers and its sales staff do not work at head office, and a fence that
 * refuses them every morning is a fence that gets switched off for everybody
 * inside a week. The reason is stored with the exemption because "why is this
 * person exempt" is the first question anyone reviewing the list asks.
 */
export type GeofenceExemptions = Record<string, { reason: string }>;

/** A position as captured, with everything the platform was willing to say about it. */
export interface LocationFix {
  readonly lat: number;
  readonly lng: number;
  /** Radius of the platform's own 95% confidence, in metres. */
  readonly accuracyMetres: number;
  /** Milliseconds since the epoch, as reported by the Geolocation API. */
  readonly capturedAtMs: number;
  /** `Date.now()` when the fix was received. Differs from `capturedAtMs` on a replayed fix. */
  readonly receivedAtMs: number;
  readonly altitudeMetres?: number | null;
  readonly speedMetresPerSecond?: number | null;
  readonly headingDegrees?: number | null;
}

/** Why a stamp was not accepted, or why it was flagged. */
export type GeofenceOutcome =
  | 'inside'
  | 'outside'
  | 'no-sites'
  | 'inaccurate'
  | 'unavailable'
  | 'exempt';

export interface GeofenceVerdict {
  readonly outcome: GeofenceOutcome;
  /** True when the stamp may proceed. Always true in `advisory` and for the exempt. */
  readonly accepted: boolean;
  /** The nearest site, when there was one to compare against. */
  readonly siteId: string | null;
  readonly siteName: string | null;
  /** Metres from that site's centre, rounded. Null when nothing was compared. */
  readonly distanceMetres: number | null;
  /** Integrity signals raised against the fix. Empty is the ordinary case. */
  readonly signals: IntegritySignal[];
}

/**
 * Something about a fix that a genuine one would be unlikely to show.
 *
 * Every one of these is a heuristic and every one has a false-positive story,
 * which is why they carry their own explanation: a queue of flags nobody can
 * interpret is a queue nobody works. They are deliberately not summed into a
 * "spoof score" — a single number invites a threshold, and a threshold invites
 * acting on the flag automatically, which is the one thing this must not do.
 */
export interface IntegritySignal {
  readonly code: IntegritySignalCode;
  readonly detail: string;
}

export type IntegritySignalCode =
  | 'impossible-accuracy'
  | 'no-sensor-detail'
  | 'stale-fix'
  | 'repeated-fix'
  | 'impossible-travel'
  | 'exact-centre';

/** Metres per degree of longitude at a given latitude. */
export function metresPerDegreeLongitudeAt(lat: number): number {
  return METRES_PER_DEGREE_LNG_EQUATOR * Math.cos((lat * Math.PI) / 180);
}

/**
 * Squared distance in metres between a fix and a site.
 *
 * Squared, so that neither this nor `firestore.rules` needs a square root —
 * `d² <= r²` answers "inside" exactly as well as `d <= r` and rules have no
 * `sqrt`. The projection is equirectangular, which is wrong by under a metre
 * over the few hundred metres a fence spans and is what makes the whole
 * comparison expressible in arithmetic the server can also do.
 *
 * MIRRORED IN `firestore.rules` (`withinSite`). Change both together, or the
 * server will accept stamps the client refused and refuse stamps it accepted.
 */
export function squaredMetresBetween(
  fix: { lat: number; lng: number },
  site: Pick<GeofenceSite, 'lat' | 'lng' | 'metresPerDegreeLng'>,
): number {
  const dy = (fix.lat - site.lat) * METRES_PER_DEGREE_LAT;
  const dx = (fix.lng - site.lng) * site.metresPerDegreeLng;
  return dy * dy + dx * dx;
}

/** Whole metres between a fix and a site. */
export function metresBetween(
  fix: { lat: number; lng: number },
  site: Pick<GeofenceSite, 'lat' | 'lng' | 'metresPerDegreeLng'>,
): number {
  return Math.round(Math.sqrt(squaredMetresBetween(fix, site)));
}

/** The site this fix is closest to, with its distance. Null when there are no sites. */
export function nearestSite(
  sites: GeofenceSite[],
  fix: { lat: number; lng: number },
): { site: GeofenceSite; distanceMetres: number } | null {
  let best: { site: GeofenceSite; distanceMetres: number } | null = null;
  for (const site of sites) {
    const distanceMetres = metresBetween(fix, site);
    if (!best || distanceMetres < best.distanceMetres) best = { site, distanceMetres };
  }
  return best;
}

/**
 * Is this fix inside this site?
 *
 * The fix's own accuracy is *not* added to the radius here. Doing so would
 * mean a deliberately degraded fix — trivial to produce — enlarges every fence
 * it is compared against. Accuracy is handled once, before this, by refusing a
 * fix too vague to place anybody (`maxAccuracyMetres`).
 */
export function isInsideSite(
  fix: { lat: number; lng: number },
  site: GeofenceSite,
): boolean {
  return squaredMetresBetween(fix, site) <= site.radiusMetres * site.radiusMetres;
}

/**
 * Signals raised against a fix, given the one before it.
 *
 * `previous` is the employee's own last accepted fix, and may be absent — the
 * first stamp anybody makes has nothing to compare against, which is not
 * itself suspicious.
 */
export function assessIntegrity(
  fix: LocationFix,
  previous?: { lat: number; lng: number; capturedAtMs: number } | null,
  site?: GeofenceSite | null,
): IntegritySignal[] {
  const signals: IntegritySignal[] = [];

  // A real fix is never certain. GNSS on a phone reports 3-30 m in the open
  // and worse indoors; wifi trilateration reports 20-100 m. Sub-metre certainty
  // from a browser means the number was asserted rather than measured.
  if (fix.accuracyMetres <= 1) {
    signals.push({
      code: 'impossible-accuracy',
      detail: `Reported accuracy of ${fix.accuracyMetres} m is below what any consumer receiver produces.`,
    });
  }

  // Mock providers commonly supply latitude and longitude and nothing else.
  // On its own this is weak — a wifi or IP fix legitimately has no altitude or
  // speed — so it is only raised alongside a precision a wifi fix never has.
  const noSensorDetail =
    (fix.altitudeMetres === null || fix.altitudeMetres === undefined) &&
    (fix.speedMetresPerSecond === null || fix.speedMetresPerSecond === undefined) &&
    (fix.headingDegrees === null || fix.headingDegrees === undefined);
  if (noSensorDetail && fix.accuracyMetres <= 10) {
    signals.push({
      code: 'no-sensor-detail',
      detail:
        'Satellite-grade precision with no altitude, speed or heading — the shape of an injected fix rather than a receiver one.',
    });
  }

  // The Geolocation API's own timestamp against the wall clock. A fix replayed
  // from a recording, or one served from a mock app's fixed coordinates, is
  // often minutes or hours stale.
  const ageMs = fix.receivedAtMs - fix.capturedAtMs;
  if (ageMs > 5 * 60_000) {
    signals.push({
      code: 'stale-fix',
      detail: `Position was ${Math.round(ageMs / 60_000)} minutes old when it was submitted.`,
    });
  }

  if (previous) {
    // Two genuine fixes are never bit-identical: the last decimal place moves
    // even on a phone sitting still on a desk. Identical coordinates mean a
    // constant was replayed.
    if (previous.lat === fix.lat && previous.lng === fix.lng) {
      signals.push({
        code: 'repeated-fix',
        detail: 'Coordinates are identical to this employee’s previous stamp, to the last decimal place.',
      });
    }

    // Distance over elapsed time. 300 km/h clears every road and rail journey
    // in India and still catches the office-to-home-in-four-minutes case; it
    // will flag a genuine domestic flight, which is why it is a flag and not a
    // refusal.
    const elapsedMs = Math.max(1, fix.capturedAtMs - previous.capturedAtMs);
    const metres = metresBetween(fix, {
      lat: previous.lat,
      lng: previous.lng,
      metresPerDegreeLng: metresPerDegreeLongitudeAt(previous.lat),
    });
    const kmPerHour = (metres / 1000) / (elapsedMs / 3_600_000);
    if (kmPerHour > 300) {
      signals.push({
        code: 'impossible-travel',
        detail: `${Math.round(metres / 1000)} km from the previous stamp in ${Math.round(elapsedMs / 60_000)} minutes.`,
      });
    }
  }

  // Landing on the fence's own centre to five decimal places is a metre-square
  // target. It is where a typed-in coordinate lands, and where no receiver does.
  if (site && Math.abs(fix.lat - site.lat) < 1e-5 && Math.abs(fix.lng - site.lng) < 1e-5) {
    signals.push({
      code: 'exact-centre',
      detail: 'Position is the fence’s own centre point, which a receiver does not land on.',
    });
  }

  return signals;
}

/**
 * The whole verdict for one captured fix.
 *
 * `accepted` answers only "may this stamp proceed", and in `advisory` mode it
 * is always true — the outcome and the signals are still recorded, because the
 * point of advisory is to collect exactly the evidence enforcement would have
 * acted on.
 *
 * An exempt employee is short-circuited before anything is evaluated: their
 * position is not captured at all, so there is nothing to store about where
 * somebody the organisation decided not to fence happened to be.
 */
export function evaluateFix(input: {
  config: GeofenceConfig;
  fix: LocationFix | null;
  exempt?: boolean;
  previous?: { lat: number; lng: number; capturedAtMs: number } | null;
}): GeofenceVerdict {
  const { config, fix, exempt, previous } = input;

  const none = (outcome: GeofenceOutcome, accepted: boolean): GeofenceVerdict => ({
    outcome,
    accepted,
    siteId: null,
    siteName: null,
    distanceMetres: null,
    signals: [],
  });

  if (exempt) return none('exempt', true);
  if (config.mode === 'off') return none('exempt', true);
  // Nothing to measure against. Refusing here would lock out an organisation
  // that switched enforcement on before drawing a fence, which is a
  // misconfiguration to report rather than an attendance failure to punish.
  if (config.sites.length === 0) return none('no-sites', true);
  if (!fix) return none('unavailable', config.mode !== 'enforced');
  if (fix.accuracyMetres > config.maxAccuracyMetres) {
    return none('inaccurate', config.mode !== 'enforced');
  }

  const nearest = nearestSite(config.sites, fix);
  // Unreachable while sites is non-empty; kept so the function is total.
  if (!nearest) return none('no-sites', true);

  const inside = isInsideSite(fix, nearest.site);
  const signals = assessIntegrity(fix, previous, nearest.site);

  return {
    outcome: inside ? 'inside' : 'outside',
    accepted: inside || config.mode !== 'enforced',
    siteId: nearest.site.id,
    siteName: nearest.site.name,
    distanceMetres: nearest.distanceMetres,
    signals,
  };
}

/** What to tell the person standing there, in their terms rather than the system's. */
export function describeVerdict(verdict: GeofenceVerdict, mode: GeofenceMode): string {
  switch (verdict.outcome) {
    case 'inside':
      return `Confirmed at ${verdict.siteName} (${verdict.distanceMetres} m from its centre).`;
    case 'outside':
      return mode === 'enforced'
        ? `You are ${verdict.distanceMetres} m from ${verdict.siteName}, outside its attendance area. Move closer, or raise a regularization if you are working elsewhere today.`
        : `Recorded ${verdict.distanceMetres} m from ${verdict.siteName}, outside its attendance area.`;
    case 'inaccurate':
      return mode === 'enforced'
        ? 'Your device could not place you precisely enough to confirm you are on site. Move somewhere with a clearer signal and try again.'
        : 'Recorded, but your device could not place you precisely enough to confirm the site.';
    case 'unavailable':
      return mode === 'enforced'
        ? 'Location is required to check in. Allow location access for this site in your browser and try again.'
        : 'Recorded without a location — your browser did not provide one.';
    case 'no-sites':
      return 'Recorded. Nobody has set up attendance locations for your organisation yet.';
    case 'exempt':
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Normalisation — everything below is what makes a stored config trustworthy.
// ---------------------------------------------------------------------------

/** Clamp a radius into the range a fence is allowed to span. */
export function clampRadius(metres: number): number {
  if (!Number.isFinite(metres)) return MIN_GEOFENCE_RADIUS_METRES;
  return Math.min(MAX_GEOFENCE_RADIUS_METRES, Math.max(MIN_GEOFENCE_RADIUS_METRES, Math.round(metres)));
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Build a site from typed input, deriving what must not be typed.
 *
 * `metresPerDegreeLng` is derived here rather than accepted, so a hand-edited
 * or replayed config cannot widen a fence by claiming a longitude degree is
 * worth ten metres. The rules range-check it for the same reason.
 */
export function buildSite(input: {
  id: string;
  name: string;
  locationName?: string;
  lat: number;
  lng: number;
  radiusMetres: number;
}): GeofenceSite | null {
  if (!isValidLatitude(input.lat) || !isValidLongitude(input.lng)) return null;
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) return null;
  return {
    id: input.id,
    name,
    ...(input.locationName ? { locationName: input.locationName } : {}),
    lat: input.lat,
    lng: input.lng,
    radiusMetres: clampRadius(input.radiusMetres),
    metresPerDegreeLng: metresPerDegreeLongitudeAt(input.lat),
  };
}

/**
 * Coerce whatever was in storage into a usable config.
 *
 * A stored value is JSON that some earlier version of this app wrote, so every
 * field is treated as unknown. A site that cannot be made valid is dropped
 * rather than repaired: a fence at a repaired coordinate is a fence somewhere
 * nobody chose.
 */
export function normalizeGeofenceConfig(value: unknown): GeofenceConfig {
  if (!value || typeof value !== 'object') return EMPTY_GEOFENCE_CONFIG;
  const raw = value as Record<string, unknown>;

  const mode: GeofenceMode =
    raw.mode === 'advisory' || raw.mode === 'enforced' || raw.mode === 'off'
      ? raw.mode
      : 'off';

  const sites = Array.isArray(raw.sites)
    ? raw.sites.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const site = entry as Record<string, unknown>;
        const built = buildSite({
          id: typeof site.id === 'string' && site.id ? site.id : '',
          name: typeof site.name === 'string' ? site.name : '',
          locationName: typeof site.locationName === 'string' ? site.locationName : undefined,
          lat: site.lat as number,
          lng: site.lng as number,
          radiusMetres: site.radiusMetres as number,
        });
        return built && built.id ? [built] : [];
      })
    : [];

  const accuracy = raw.maxAccuracyMetres;
  const maxAccuracyMetres =
    typeof accuracy === 'number' && Number.isFinite(accuracy)
      ? Math.min(2000, Math.max(20, Math.round(accuracy)))
      : EMPTY_GEOFENCE_CONFIG.maxAccuracyMetres;

  return { mode, sites, maxAccuracyMetres };
}

/** Coerce the stored exemption map, dropping anything malformed. */
export function normalizeExemptions(value: unknown): GeofenceExemptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: GeofenceExemptions = {};
  for (const [employeeId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!employeeId) continue;
    const reason =
      entry && typeof entry === 'object' && typeof (entry as { reason?: unknown }).reason === 'string'
        ? (entry as { reason: string }).reason.trim().slice(0, 200)
        : '';
    out[employeeId] = { reason };
  }
  return out;
}
