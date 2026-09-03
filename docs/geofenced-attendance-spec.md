# Geofenced attendance

HR draws the places the organisation accepts a check-in from; each check-in and
check-out captures a position, is judged against those places, and is filed as
evidence that its own author cannot edit. Readings whose *shape* does not look
like a real receiver's are flagged for a human, who decides.

## 1. What this proves, and what it does not

This is the whole design constraint, so it comes first.

**It proves** that a submitted position lies inside a fence the organisation
actually drew; that the moment is the server's; that the stamp was filed by the
employee it is about; and that nobody — the employee, their manager, or an
administrator — can alter it afterwards. All four are enforced in
`firestore.rules`, not in the app, and are covered by
`tests/rules/attendance-stamps.rules.test.mjs`.

**It does not prove that the coordinates are true.** No browser API can. The
Geolocation API reports whatever the platform hands it, and on a rooted or
developer-mode Android device that is whatever a mock-location app says. Any
product claiming otherwise from a web app is wrong.

So the feature does the honest thing instead: it records what was claimed,
flags the claims that look synthetic, and puts them in front of somebody who
can go and check. **`falsified` is a human's finding, never the system's
inference** — which is why it is written by an administrator, into a separate
field, on a stamp that stays byte-identical underneath.

Closing the remaining gap needs device attestation (Play Integrity / App
Attest) verified by a Cloud Function before the write. That needs a mobile app
and a backend this project does not have. The migration path is deliberate:
keep this collection and this document shape, and have the Function verify a
token before writing. Nothing above the storage layer changes.

## 2. The pieces

| File | What it is |
| --- | --- |
| `src/data/geofenceRules.ts` | The arithmetic. Imports nothing; unit tested (`npm run test:unit`). |
| `src/data/attendanceGeofence.ts` | Storage half: the `org_settings` registry, the localStorage cache, the change event, and the rules projection. |
| `src/lib/geolocation.ts` | The one seam that reads `navigator.geolocation`. |
| `src/lib/attendanceStamps.ts` | The Firestore evidence: filing, reading, reviewing. |
| `src/pages/settings/index.tsx` → `AttendanceLocationsSection` | Where HR sets it up. |
| `src/pages/attendance/LocationReviewQueue.tsx` | The queue, and the finding. |
| `firestore.rules` → `attendance_stamps`, `attendance_geofences` | The actual boundary. |

## 3. Configuration is the organisation's, and there is no default

`ORG_SETTINGS.attendanceGeofence` holds `{ mode, sites[], maxAccuracyMetres }`;
`ORG_SETTINGS.geofenceExemptions` holds the sparse per-employee exemption map.
Both publish on one change event, for the reason every other paired setting in
this app does: a surface that re-rendered for the fence but not for who is
exempt would show the two disagreeing.

**A fresh organisation has `mode: 'off'` and no sites.** Nothing is captured
until HR draws a fence. Same reasoning as the holiday calendar and the salary
split: a plausible default is indistinguishable from a decision the
organisation made, and here the consequence of an invented fence is that people
are refused a check-in at a place nobody chose.

**Three modes, and `advisory` is the one that matters.** An organisation cannot
know in advance that its office wifi geolocates 600 m down the road. Advisory
captures and judges everything and refuses nobody, so the review queue fills
with exactly the evidence enforcement would have acted on. The intended path is
a fortnight of advisory, adjust the fences, then enforce.

**500 m is the cap** (`MAX_GEOFENCE_RADIUS_METRES`), 25 m the floor. Beyond a
few hundred metres a fence stops answering "is this person at work" — a 2 km
circle round a city-centre office covers a dozen cafés and somebody's flat. The
honest failure of a too-tight fence (a refused check-in, which regularization
already handles) is far cheaper than that of a too-loose one.

**Exemptions are not decoration.** A construction company's site engineers and
its field sales do not work at head office. A fence that refuses them every
morning is a fence that gets switched off for everybody inside a week. An
exempt employee's position is *not captured at all* — not captured and ignored.

## 4. The arithmetic, and why it is shaped like that

Distance is equirectangular and **squared**:

```
dy = (lat − site.lat) × 110574
dx = (lng − site.lng) × site.metresPerDegreeLng
inside ⟺ dy² + dx² ≤ radius²
```

Squared because `firestore.rules` has no `sqrt`, and `d² ≤ r²` answers the same
question. The projection is wrong by under a metre across the few hundred
metres a fence spans.

`metresPerDegreeLng` is **stored on the site**, not derived at evaluation time,
because rules have no `cos` either. It is derived by the client
(`metresPerDegreeLongitudeAt`) and never accepted as input, and the rules
range-check it to `[0, 111320]`.

**The fix's own accuracy is never added to the radius.** Doing so would mean a
deliberately degraded reading — trivial to produce — enlarges every fence it
meets. Accuracy is handled once, before the comparison: a reading vaguer than
`maxAccuracyMetres` cannot place anybody and is refused as `inaccurate`.

At the exact boundary, float cancellation decides arbitrarily — `lat + 100/110574`
minus `lat` does not round-trip. It decides the same way in the rules, which do
identical arithmetic on identical values, so client and server agree. The
ambiguity is sub-centimetre on a 100 m fence.

## 5. Two copies of the fence, and why

The app reads `org_settings/<orgKey>__attendanceGeofence`, whose payload is a
JSON **string** — that is what the settings registry stores, so the sync can
treat every setting alike. Rules have no JSON parser, so that copy is
unreadable to them, and a rule that cannot read the fence cannot check a claim
against it.

Hence `attendance_geofences/{orgKey}`: a structured projection, keyed by site
id (rules cannot search a list), written by `saveGeofenceConfig` in the same
act. **The app never reads it back**, so the two cannot drift into disagreeing
about what the app *shows*. What they can drift on is what the server
*accepts*, and that fails closed — a stale or missing projection refuses
`inside` claims rather than granting them, and an administrator fixes it by
saving the fence again.

An earlier draft had the client send the site geometry with each stamp
(`claimedSite`) and had the rules check only self-consistency. That left a hole
you could drive a lorry through: forge a fence around your own sofa and every
check-in is "inside". The projection closes it — the caller cannot supply the
geometry it is judged by. `tests/rules/attendance-stamps.rules.test.mjs` has
the test that would have caught it ("refuses inside against a site the
organisation never drew") and one for the obvious follow-up ("an employee
cannot draw a fence around themselves").

## 6. Integrity signals

Heuristics, all of them, each with a false-positive story — which is why each
carries its own explanation into the queue, and why they are **not summed into
a score**. A single number invites a threshold, and a threshold invites acting
on the flag automatically, which is the one thing this must not do.

| Signal | What it is | Its false positive |
| --- | --- | --- |
| `impossible-accuracy` | Reported accuracy ≤ 1 m | None known; no consumer receiver does this |
| `no-sensor-detail` | Satellite precision, but no altitude/speed/heading | Only raised when accuracy ≤ 10 m, so a wifi fix does not trip it |
| `stale-fix` | Position was > 5 min old when submitted | A backgrounded tab |
| `repeated-fix` | Coordinates bit-identical to the previous stamp | None known; real GPS never repeats exactly |
| `impossible-travel` | > 300 km/h from the previous stamp | A domestic flight |
| `exact-centre` | Within 1e-5° of the fence centre | None known; that is a metre-square target |

A flagged stamp is still **accepted**. The flag is for a human.

## 7. The stamp is the evidence

`attendance_stamps`, id `<orgId>__<employeeId>__<YYYY-MM-DD>__in|out`.
Deliberately **not** part of `AttendanceRecord`, which lives in the
localStorage overlay the employee's own browser owns — a stamp anyone can edit
in devtools is not evidence of anything.

The rules give it four properties, in descending order of importance:

1. **Immutable to its author.** No `update` an employee can make, no `delete`
   short of an org admin. This is the feature; everything else is detail.
2. **Created only by `isSelf`.** Not a manager, not HR. Recording somebody
   else's day is what Attendance → Mark Attendance is for, and that writes
   hand-entered times without pretending they were captured.
3. **`recordedAt == request.time`.** The device's clock gets no vote.
4. **`outcome: 'inside'` recomputed** against the projection.

Only `inside` is checked against the geometry, and the asymmetry is deliberate:
`inside` is the only claim worth forging. `outside`, `inaccurate` and
`unavailable` are claims against the employee's own interest, and a stricter
rule would refuse honest stamps from an organisation whose fence has since
moved — a real event.

The review is the one field an administrator may add, `affectedKeys().hasOnly(['review'])`
so that "review this stamp" cannot double as "correct where it says I was", and
`!isSelf(resource.data.employeeId)` so nobody clears their own flag.

## 8. Ordering at the check-in

`stampLocation` runs **before** the attendance record moves. Under enforcement
a refused fix must leave the day exactly as it was, or the refusal is cosmetic.

The stamp is filed **either way** — including when the check-in is refused —
because "this person tried to check in from 4 km away" is precisely what the
review queue exists to hold.

A stamp that cannot be filed is reported, not swallowed. The attendance record
still moves (refusing to record a day because its evidence did not save would
punish an employee for a network fault), but nobody is told the location was
confirmed when it was not.

A check-out is stamped against the day the shift *started*, matching
`recordCheckOut`, so a shift begun at 23:50 files two stamps belonging to one
shift rather than to two days.

## 9. Testing

- `tests/unit/geofenceRules.test.ts` — the arithmetic, the mode matrix, every
  signal and its false positive, and the normalisation that keeps a
  hand-edited config from widening a fence.
- `tests/rules/attendance-stamps.rules.test.mjs` — the boundary. Every claim in
  §7, plus tenant separation. None of this is reachable through the UI, which
  is exactly why it is here.
- `tests/e2e/geofenced-attendance.spec.ts` — the flow, with
  `navigator.geolocation` stubbed per context (`tests/e2e/geolocation.ts`).
  Playwright's own `setGeolocation` supplies only lat/lng/accuracy, which is
  not enough to exercise the integrity signals.
