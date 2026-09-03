// Unit tests for the pure geofence arithmetic in src/data/geofenceRules.ts.
//
// Run: npm run test:unit
//
// The module under test imports nothing, deliberately: node's strip-types
// runner resolves neither the `@/*` alias nor firebase, so anything reaching
// for storage or for `navigator.geolocation` cannot be unit tested here.
// Storage wiring lives in src/data/attendanceGeofence.ts and the enforcement
// half in firestore.rules; both are covered by
// tests/rules/attendance-stamps.rules.test.mjs and
// tests/e2e/geofenced-attendance.spec.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_GEOFENCE_RADIUS_METRES,
  assessIntegrity,
  buildSite,
  clampRadius,
  evaluateFix,
  isInsideSite,
  metresBetween,
  metresPerDegreeLongitudeAt,
  nearestSite,
  normalizeExemptions,
  normalizeGeofenceConfig,
  type GeofenceConfig,
  type GeofenceSite,
  type LocationFix,
} from '../../src/data/geofenceRules.ts';

// ModCon Builders' head office, Bengaluru — the coordinates the demo data
// would use. Latitude ~12.97 puts the longitude degree at roughly 108.5 km.
const HQ: GeofenceSite = {
  id: 'site-hq',
  name: 'Head Office',
  lat: 12.9716,
  lng: 77.5946,
  radiusMetres: 200,
  metresPerDegreeLng: metresPerDegreeLongitudeAt(12.9716),
};

const CONFIG: GeofenceConfig = { mode: 'enforced', sites: [HQ], maxAccuracyMetres: 120 };

function fixAt(lat: number, lng: number, overrides: Partial<LocationFix> = {}): LocationFix {
  const now = 1_760_000_000_000;
  return {
    lat,
    lng,
    accuracyMetres: 12,
    capturedAtMs: now,
    receivedAtMs: now,
    altitudeMetres: 920,
    speedMetresPerSecond: 0,
    headingDegrees: null,
    ...overrides,
  };
}

// ---- distance -------------------------------------------------------------

test('a position on the site centre is zero metres away', () => {
  assert.equal(metresBetween({ lat: HQ.lat, lng: HQ.lng }, HQ), 0);
});

test('one ten-thousandth of a degree of latitude is about eleven metres', () => {
  // 110574 m per degree, so 0.0001° ≈ 11.06 m. This is the scale a fence
  // operates at, so the projection has to be right here rather than at 100 km.
  assert.equal(metresBetween({ lat: HQ.lat + 0.0001, lng: HQ.lng }, HQ), 11);
});

test('a degree of longitude is shorter than a degree of latitude away from the equator', () => {
  const north = metresBetween({ lat: HQ.lat + 0.01, lng: HQ.lng }, HQ);
  const east = metresBetween({ lat: HQ.lat, lng: HQ.lng + 0.01 }, HQ);
  assert.ok(east < north, `expected ${east} < ${north}`);
  // cos(12.97°) ≈ 0.9745, and the two per-degree constants differ slightly.
  assert.ok(Math.abs(east / north - 0.9808) < 0.01, `ratio was ${east / north}`);
});

test('the longitude scale factor collapses towards the pole and is widest at the equator', () => {
  assert.ok(Math.abs(metresPerDegreeLongitudeAt(0) - 111_320) < 1);
  assert.ok(metresPerDegreeLongitudeAt(60) < 56_000);
  assert.ok(metresPerDegreeLongitudeAt(89) < 2_000);
});

// ---- inside / outside -----------------------------------------------------

test('a position well within the radius is inside', () => {
  assert.equal(isInsideSite(fixAt(HQ.lat + 0.0005, HQ.lng), HQ), true);
});

test('a position beyond the radius is outside', () => {
  // 0.003° of latitude ≈ 332 m, comfortably past a 200 m fence.
  assert.equal(isInsideSite(fixAt(HQ.lat + 0.003, HQ.lng), HQ), false);
});

test('the boundary decides at centimetre scale, and is not asserted at the last ULP', () => {
  const site: GeofenceSite = { ...HQ, radiusMetres: 100 };
  const metresNorth = (m: number) => ({ lat: HQ.lat + m / 110_574, lng: HQ.lng });

  // Comfortably in, comfortably out. What the fence has to get right.
  assert.equal(isInsideSite(metresNorth(99.9), site), true);
  assert.equal(isInsideSite(metresNorth(100.1), site), false);

  // Exactly 100 m is deliberately NOT asserted. `HQ.lat + 100/110574` minus
  // `HQ.lat` does not round-trip to 100 in binary floating point — the
  // subtraction of two numbers that agree to five significant figures throws
  // away the low bits — so the last-ULP verdict is arbitrary. It is arbitrary
  // in the same direction in `firestore.rules`, which does the identical
  // arithmetic on the identical values, so the client and server still agree;
  // and a sub-centimetre ambiguity on a 100 m fence is beneath the accuracy of
  // any receiver that will ever be compared against it.
});

test('nearestSite picks the closer of two fences', () => {
  const other: GeofenceSite = {
    ...HQ,
    id: 'site-annexe',
    name: 'Annexe',
    lat: HQ.lat + 0.01,
  };
  const near = nearestSite([HQ, other], { lat: HQ.lat + 0.009, lng: HQ.lng });
  assert.equal(near?.site.id, 'site-annexe');
});

test('nearestSite is null when the organisation has drawn no fences', () => {
  assert.equal(nearestSite([], { lat: HQ.lat, lng: HQ.lng }), null);
});

// ---- evaluateFix ----------------------------------------------------------

test('a fix inside a fence is accepted and names the site', () => {
  const verdict = evaluateFix({ config: CONFIG, fix: fixAt(HQ.lat, HQ.lng + 0.0004) });
  assert.equal(verdict.outcome, 'inside');
  assert.equal(verdict.accepted, true);
  assert.equal(verdict.siteId, 'site-hq');
  assert.equal(verdict.siteName, 'Head Office');
});

test('enforced mode refuses a fix outside every fence', () => {
  const verdict = evaluateFix({ config: CONFIG, fix: fixAt(HQ.lat + 0.01, HQ.lng) });
  assert.equal(verdict.outcome, 'outside');
  assert.equal(verdict.accepted, false);
  assert.ok(verdict.distanceMetres && verdict.distanceMetres > 1000);
});

test('advisory mode records the same verdict and accepts it anyway', () => {
  const verdict = evaluateFix({
    config: { ...CONFIG, mode: 'advisory' },
    fix: fixAt(HQ.lat + 0.01, HQ.lng),
  });
  // The point of advisory: the evidence enforcement would have acted on is
  // still collected, so an organisation can read it before switching over.
  assert.equal(verdict.outcome, 'outside');
  assert.equal(verdict.accepted, true);
});

test('a fix too vague to place anybody is refused under enforcement, not stretched', () => {
  const verdict = evaluateFix({
    config: CONFIG,
    fix: fixAt(HQ.lat, HQ.lng, { accuracyMetres: 3000 }),
  });
  assert.equal(verdict.outcome, 'inaccurate');
  assert.equal(verdict.accepted, false);
});

test('accuracy is not added to the radius', () => {
  // A fix 300 m out with ±100 m accuracy is outside a 200 m fence. Widening
  // the fence by the fix's own accuracy would let a deliberately degraded
  // reading enlarge every fence it meets.
  const verdict = evaluateFix({
    config: CONFIG,
    fix: fixAt(HQ.lat + 0.0027, HQ.lng, { accuracyMetres: 100 }),
  });
  assert.equal(verdict.outcome, 'outside');
});

test('no position at all is refused under enforcement and recorded under advisory', () => {
  assert.equal(evaluateFix({ config: CONFIG, fix: null }).accepted, false);
  assert.equal(evaluateFix({ config: CONFIG, fix: null }).outcome, 'unavailable');
  assert.equal(
    evaluateFix({ config: { ...CONFIG, mode: 'advisory' }, fix: null }).accepted,
    true,
  );
});

test('an organisation that enforces before drawing a fence locks nobody out', () => {
  // A misconfiguration to report, not an attendance failure to punish.
  const verdict = evaluateFix({ config: { ...CONFIG, sites: [] }, fix: fixAt(0, 0) });
  assert.equal(verdict.outcome, 'no-sites');
  assert.equal(verdict.accepted, true);
});

test('an exempt employee is never evaluated and never located', () => {
  const verdict = evaluateFix({
    config: CONFIG,
    fix: fixAt(HQ.lat + 5, HQ.lng + 5),
    exempt: true,
  });
  assert.equal(verdict.outcome, 'exempt');
  assert.equal(verdict.accepted, true);
  assert.equal(verdict.siteId, null);
  assert.equal(verdict.distanceMetres, null);
});

test('mode off evaluates nothing even with fences drawn', () => {
  const verdict = evaluateFix({ config: { ...CONFIG, mode: 'off' }, fix: fixAt(0, 0) });
  assert.equal(verdict.outcome, 'exempt');
  assert.equal(verdict.accepted, true);
});

// ---- integrity signals ----------------------------------------------------

test('an ordinary fix raises nothing', () => {
  assert.deepEqual(assessIntegrity(fixAt(HQ.lat + 0.0005, HQ.lng), null, HQ), []);
});

test('sub-metre accuracy from a browser is flagged', () => {
  const signals = assessIntegrity(fixAt(HQ.lat + 0.0005, HQ.lng, { accuracyMetres: 1 }), null, HQ);
  assert.ok(signals.some((s) => s.code === 'impossible-accuracy'));
});

test('satellite precision with no altitude, speed or heading is flagged', () => {
  const signals = assessIntegrity(
    fixAt(HQ.lat + 0.0005, HQ.lng, {
      accuracyMetres: 5,
      altitudeMetres: null,
      speedMetresPerSecond: null,
      headingDegrees: null,
    }),
    null,
    HQ,
  );
  assert.ok(signals.some((s) => s.code === 'no-sensor-detail'));
});

test('a wifi-grade fix with no sensor detail is NOT flagged', () => {
  // The false positive worth avoiding: a laptop on office wifi legitimately
  // reports no altitude and ±40 m. Flagging it would fill the queue with the
  // ordinary case and nobody would work it.
  const signals = assessIntegrity(
    fixAt(HQ.lat + 0.0005, HQ.lng, {
      accuracyMetres: 40,
      altitudeMetres: null,
      speedMetresPerSecond: null,
      headingDegrees: null,
    }),
    null,
    HQ,
  );
  assert.equal(signals.length, 0);
});

test('a fix that was minutes old when submitted is flagged as stale', () => {
  const now = 1_760_000_000_000;
  const signals = assessIntegrity(
    fixAt(HQ.lat, HQ.lng, { capturedAtMs: now - 20 * 60_000, receivedAtMs: now }),
    null,
    HQ,
  );
  assert.ok(signals.some((s) => s.code === 'stale-fix'));
});

test('coordinates identical to the previous stamp are flagged', () => {
  const previous = { lat: HQ.lat + 0.0005, lng: HQ.lng, capturedAtMs: 1_759_000_000_000 };
  const signals = assessIntegrity(fixAt(previous.lat, previous.lng), previous, HQ);
  assert.ok(signals.some((s) => s.code === 'repeated-fix'));
});

test('two genuine fixes a few metres apart are not flagged as repeated', () => {
  const previous = { lat: HQ.lat + 0.0005, lng: HQ.lng, capturedAtMs: 1_759_000_000_000 };
  const signals = assessIntegrity(fixAt(previous.lat + 0.00002, previous.lng), previous, HQ);
  assert.equal(signals.some((s) => s.code === 'repeated-fix'), false);
});

test('crossing the country in four minutes is flagged as impossible travel', () => {
  const now = 1_760_000_000_000;
  const previous = { lat: 28.6139, lng: 77.209, capturedAtMs: now - 4 * 60_000 }; // Delhi
  const signals = assessIntegrity(fixAt(HQ.lat, HQ.lng, { capturedAtMs: now }), previous, HQ);
  assert.ok(signals.some((s) => s.code === 'impossible-travel'));
});

test('an ordinary commute is not impossible travel', () => {
  const now = 1_760_000_000_000;
  const previous = { lat: HQ.lat + 0.08, lng: HQ.lng, capturedAtMs: now - 40 * 60_000 };
  const signals = assessIntegrity(fixAt(HQ.lat, HQ.lng, { capturedAtMs: now }), previous, HQ);
  assert.equal(signals.some((s) => s.code === 'impossible-travel'), false);
});

test('landing exactly on the fence centre is flagged', () => {
  const signals = assessIntegrity(fixAt(HQ.lat, HQ.lng), null, HQ);
  assert.ok(signals.some((s) => s.code === 'exact-centre'));
});

test('signals ride along with an inside verdict rather than overriding it', () => {
  // A flagged stamp is still accepted: the flag is for a human to judge, and
  // refusing on a heuristic would punish the false positives automatically.
  const verdict = evaluateFix({
    config: CONFIG,
    fix: fixAt(HQ.lat, HQ.lng, { accuracyMetres: 0.5 }),
  });
  assert.equal(verdict.outcome, 'inside');
  assert.equal(verdict.accepted, true);
  assert.ok(verdict.signals.length >= 1);
});

// ---- normalisation --------------------------------------------------------

test('a radius is clamped to the 500 m cap', () => {
  assert.equal(clampRadius(5000), MAX_GEOFENCE_RADIUS_METRES);
  assert.equal(clampRadius(2), 25);
  assert.equal(clampRadius(Number.NaN), 25);
});

test('buildSite derives the longitude scale rather than accepting one', () => {
  // Accepting it would let a hand-edited config claim a longitude degree is
  // worth ten metres and widen every fence by four orders of magnitude.
  const site = buildSite({
    id: 'x',
    name: '  Head   Office ',
    lat: 12.9716,
    lng: 77.5946,
    radiusMetres: 900,
  });
  assert.equal(site?.name, 'Head Office');
  assert.equal(site?.radiusMetres, MAX_GEOFENCE_RADIUS_METRES);
  assert.ok(Math.abs((site?.metresPerDegreeLng ?? 0) - metresPerDegreeLongitudeAt(12.9716)) < 1e-9);
});

test('buildSite refuses impossible coordinates and empty names', () => {
  assert.equal(buildSite({ id: 'x', name: 'A', lat: 99, lng: 0, radiusMetres: 100 }), null);
  assert.equal(buildSite({ id: 'x', name: 'A', lat: 0, lng: 200, radiusMetres: 100 }), null);
  assert.equal(buildSite({ id: 'x', name: '  ', lat: 0, lng: 0, radiusMetres: 100 }), null);
});

test('a stored config with a broken site drops that site rather than repairing it', () => {
  // A fence at a repaired coordinate is a fence somewhere nobody chose.
  const config = normalizeGeofenceConfig({
    mode: 'enforced',
    maxAccuracyMetres: 100,
    sites: [
      { id: 'ok', name: 'Head Office', lat: 12.97, lng: 77.59, radiusMetres: 150 },
      { id: 'broken', name: 'Nowhere', lat: 'twelve', lng: 77.59, radiusMetres: 150 },
    ],
  });
  assert.equal(config.sites.length, 1);
  assert.equal(config.sites[0].id, 'ok');
});

test('an unrecognised mode falls back to off rather than to enforcement', () => {
  assert.equal(normalizeGeofenceConfig({ mode: 'strict', sites: [] }).mode, 'off');
  assert.equal(normalizeGeofenceConfig(null).mode, 'off');
  assert.equal(normalizeGeofenceConfig('nonsense').sites.length, 0);
});

test('a stored radius past the cap is clamped on the way back in', () => {
  const config = normalizeGeofenceConfig({
    mode: 'enforced',
    sites: [{ id: 'a', name: 'A', lat: 12.97, lng: 77.59, radiusMetres: 50_000 }],
  });
  assert.equal(config.sites[0].radiusMetres, MAX_GEOFENCE_RADIUS_METRES);
});

test('exemptions coerce to a reason string and survive a malformed entry', () => {
  const exemptions = normalizeExemptions({
    'emp-002': { reason: 'Site engineer — works on client sites' },
    'emp-003': 'nonsense',
    '': { reason: 'dropped' },
  });
  assert.equal(exemptions['emp-002'].reason, 'Site engineer — works on client sites');
  assert.equal(exemptions['emp-003'].reason, '');
  assert.equal('' in exemptions, false);
});
