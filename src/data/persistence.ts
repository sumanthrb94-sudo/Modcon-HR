/**
 * Shared persistence for the mutable record collections.
 *
 * ## What changed, and why it had to
 *
 * These collections — attendance, leave, assets, expenses, helpdesk, payroll,
 * onboarding — lived in `localStorage` and nowhere else. Every module read and
 * wrote a per-browser copy, which meant two people in the same company were
 * looking at two unrelated datasets: an employee checked in on their phone and
 * HR, on a laptop, saw nothing. Clearing site data destroyed the record with no
 * backup anywhere. None of that was visible from the screens, because a demo is
 * one person in one browser.
 *
 * They are now Firestore-backed, and localStorage is the cache — exactly the
 * arrangement `lib/orgSettings.ts` already uses for configuration, and for the
 * same reason: the data modules read synchronously at module-load time, before
 * React or auth has resolved, so they cannot await a read. That contract is
 * kept. What changed is who writes the cache: `startSharedCollectionsSync`
 * subscribes once auth resolves, and every write goes to the server as well.
 *
 * ## The overlay model
 *
 * Firestore holds only what *differs* from the seed — records added or edited,
 * plus a tombstone for a seed record somebody deleted — and `get()` merges the
 * two. The alternative was to materialise the whole demo dataset into every new
 * organisation on first write, which costs hundreds of documents to say nothing
 * the code did not already say. The seed is identical code for every user, so
 * merging it locally still leaves everyone looking at the same thing.
 *
 * This is the same shape `getEmployeeDirectory()` has always had: seed, plus
 * local additions, minus local deletions.
 *
 * ## One Firestore collection, not nine
 *
 * Every store lives in `org_records`, keyed `<orgKey>__<store>__<recordId>`,
 * with the record itself carried as a JSON string in `data`. One collection
 * means one rules block rather than nine near-identical ones, and a JSON string
 * sidesteps Firestore's constraints on nested arrays and undefined fields while
 * keeping the value byte-identical to what the cache holds — the same reasoning
 * `publishOrgSetting` uses.
 *
 * `employeeId` and `status` are lifted out to top-level fields where a record
 * has them. Nothing reads them from there; `firestore.rules` does, because a
 * rule cannot parse the JSON and "only a manager may change a leave request's
 * status" has to be expressible.
 *
 * ## What this does NOT yet do
 *
 * The rules make `org_records` a **tenant** boundary — a signed-in member of an
 * organisation reads and writes that organisation's records and no other's —
 * plus the leave-status rule above. It is not yet a per-record *authority*
 * boundary: the rule that a ticket is edited by its owner, or an expense
 * approved only by a manager, still lives in the client. That is a real gap and
 * it is written up in docs/shared-records-spec.md §5; it is also strictly more
 * than existed before, when there was no server at all.
 */
import {
  collection as fsCollection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getActiveOrgKey, orgScopedKey } from '@/lib/orgScope';

/** The Firestore collection every store shares. */
export const ORG_RECORDS_COLLECTION = 'org_records';

export interface PersistentCollection<T> {
  /** Window event dispatched on every write, for components to re-read on. */
  readonly changedEvent: string;
  /** The seed with this organisation's changes applied. */
  get(): T[];
  save(next: T[]): T[];
  /** Applies a change to the current value and stores the result. */
  update(fn: (current: T[]) => T[]): T[];
}

/** A record this app can store: anything with a stable id. */
interface Identified {
  id: string;
}

/**
 * One stored deviation from the seed.
 *
 * `deleted` is a tombstone rather than an absence, because absence cannot say
 * "the seed has this and the organisation removed it" — and without that, a
 * deleted record reappears on the next read.
 */
interface OverlayEntry<T> {
  id: string;
  record?: T;
  deleted?: true;
}

type Overlay<T> = OverlayEntry<T>[];

/**
 * Who may read a store, which decides whether this browser subscribes at all.
 *
 * `org` is the default and what every store was: any signed-in member of the
 * organisation. `orgAdmin` is for a store whose documents are about the
 * company rather than about a person — see the note on `activeReader`.
 */
type StoreReadScope = 'org' | 'orgAdmin' | 'self';

interface RegisteredStore {
  storeKey: string;
  readScope: StoreReadScope;
  hydrate(entries: Array<{ id: string; json: string | null; deleted: boolean }>): void;
}

const registry: RegisteredStore[] = [];

/**
 * The organisation currently being synced, and the listener for each store.
 *
 * Held here because **stores register late**. Every page in this app is
 * `React.lazy`-loaded, so `src/data/assets.ts` is not imported until somebody
 * opens Assets — long after sign-in, and long after `startSharedCollectionsSync`
 * ran. A registry read once at sync time therefore subscribes to whichever
 * modules happened to be loaded, and every store opened afterwards silently
 * falls back to exactly the per-browser behaviour this change removed.
 *
 * So the sync keeps the org key, and a store registering while it is active
 * subscribes itself immediately.
 */
let activeOrgKey: string | null = null;
const listeners = new Map<string, () => void>();

/**
 * Who is reading, so a store that is not everybody's can say so.
 *
 * `org_records` is one collection with one rules block, and its reads were
 * organisation-wide for every signed-in member. That is right for most stores
 * — a ticket queue, an asset register, the directory — and wrong for the ones
 * that carry money. `payrollRuns` is the clearest case: a run document holds
 * `grossTotal`, `netTotal` and `employeeCount` for the WHOLE COMPANY, and
 * every employee's browser subscribed to it.
 *
 * The narrowing has to happen in both places or it breaks. A rule alone denies
 * the subscription whole — a list is evaluated against every document it
 * returns — and `subscribeStore`'s error handler only warns, so the page would
 * go on rendering a stale cache with nothing said. A client filter alone is no
 * boundary at all, since the query is the client's to change. So: the rules
 * refuse, and the client does not ask.
 *
 * Null until sign-in resolves, which is also the safe reading: a store that is
 * `orgAdmin` is not subscribed for an unknown reader.
 */
let activeReader: OrgRecordsReader | null = null;

/**
 * Who is reading, and who they are above in the reporting tree.
 *
 * `chainFor` answers "which employee ids may read this person's records" —
 * themselves plus everyone above them. It is injected rather than imported
 * because the tree lives in `@/data/employees`, which imports this module:
 * reading it from here would be a cycle. `src/lib/auth.tsx` supplies it at
 * sign-in, where both are already in scope.
 *
 * Absent, `readableBy` falls back to the subject alone. That is the
 * fail-closed direction — a manager loses sight of a report's claim until the
 * next write, rather than a colleague gaining sight of one.
 */
export interface OrgRecordsReader {
  isOrgAdmin: boolean;
  employeeId?: string | null;
  chainFor?: (employeeId: string) => string[];
}

/**
 * The lifted fields win over the copies inside `data`, and that is what makes
 * the authority rules in `firestore.rules` mean anything.
 *
 * `employeeId` and `status` are written twice: once inside the `data` JSON,
 * which is the record, and once at the top level, which is the only copy the
 * rules can read. This function used to take the JSON verbatim, so the two
 * copies were judged and rendered independently — the server checked one and
 * every browser displayed the other.
 *
 * That gap was a complete bypass of `leaveDecisionIsAuthorised` and
 * `expenseDecisionIsAuthorised`. A claimant could post a record whose JSON
 * said `"status":"Approved"` while the top-level field said `Submitted` (or
 * was absent entirely, which the rules then read as "no status to judge"),
 * and the organisation would be shown an approval nobody made. The rules now
 * require the field; this is the other half, and neither works alone —
 * requiring a declaration is pointless if the declaration is not what gets
 * rendered.
 *
 * A tombstone or a revert carries no record, so there is nothing to reconcile
 * and `null` is returned exactly as before. A malformed `data` string is left
 * untouched rather than thrown away: `hydrate` already treats unparseable
 * JSON as a record it cannot use, and swallowing the error here would turn a
 * visible fault into a silently missing row.
 */
function authoritativeJson(data: {
  data?: string;
  employeeId?: string;
  status?: string;
}): string | null {
  if (!data.data) return null;
  if (data.employeeId === undefined && data.status === undefined) return data.data;
  try {
    const record = JSON.parse(data.data) as Record<string, unknown>;
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return data.data;
    if (data.employeeId !== undefined) record.employeeId = data.employeeId;
    if (data.status !== undefined) record.status = data.status;
    return JSON.stringify(record);
  } catch {
    return data.data;
  }
}

function subscribeStore(store: RegisteredStore, orgKey: string) {
  listeners.get(store.storeKey)?.();
  // Not this reader's to read. Deliberately "do not subscribe" rather than
  // "subscribe and handle the denial": a denied listener is a console warning
  // and a permission-denied on the server for every member of the company,
  // every session, forever. The seed still supplies whatever this store shows
  // without the server, which for `payrollRuns` is the demo data and for a
  // real organisation is nothing.
  if (store.readScope === 'orgAdmin' && !activeReader?.isOrgAdmin) return;
  // A `self` store is narrowed to the records this account may read, which is
  // the other half of the rule that refuses the rest. An administrator reads
  // the organisation's, so their query is unnarrowed and matches what it
  // always did.
  //
  // An account with no employee record reads none of a `self` store, and that
  // is deliberate: `myEmployeeId()` answers null on the server too, so asking
  // for everything would be asking for a denial. Better to send no query than
  // one the rules will refuse for every member of the company, every session.
  const narrowTo =
    store.readScope === 'self' && !activeReader?.isOrgAdmin
      ? activeReader?.employeeId ?? '~nobody~'
      : null;
  listeners.set(
    store.storeKey,
    onSnapshot(
      narrowTo
        ? query(
            fsCollection(db, ORG_RECORDS_COLLECTION),
            where('orgId', '==', orgKey),
            where('store', '==', store.storeKey),
            where('readableBy', 'array-contains', narrowTo),
          )
        : query(
            fsCollection(db, ORG_RECORDS_COLLECTION),
            where('orgId', '==', orgKey),
            where('store', '==', store.storeKey),
          ),
      (snap) => {
        store.hydrate(
          snap.docs.map((d) => {
            const data = d.data() as {
              recordId?: string;
              data?: string;
              deleted?: boolean;
              employeeId?: string;
              status?: string;
            };
            return {
              id: data.recordId ?? '',
              json: authoritativeJson(data),
              deleted: Boolean(data.deleted),
            };
          }),
        );
      },
      (err) => {
        // The cache the page already read still stands, so the app degrades to
        // what it did before this existed rather than to nothing.
        console.warn(`[org-records] could not subscribe to "${store.storeKey}":`, err);
      },
    ),
  );
}

/**
 * Fired when a write the cache was already showing was refused by the server.
 *
 * A window event rather than a callback or a store field, for the same reason
 * the change notification is one: this module is read at plain module-load
 * time by code that cannot await and must not import React. The listener is
 * `SaveFailureBanner` in the layout, so a refusal is visible on whatever page
 * the person is standing on.
 */
export const ORG_RECORDS_WRITE_FAILED_EVENT = 'modcon-hr-org-records-write-failed';

export interface OrgRecordsWriteFailedDetail {
  store: string;
  message: string;
}

/**
 * What to tell somebody whose change was refused.
 *
 * `permission-denied` is singled out because it is now the ORDINARY refusal
 * rather than an infrastructure fault: `firestore.rules` refuses an employee
 * who approves their own expense claim or moves their own leave out of
 * Pending. Reporting that as "could not reach the server" would send them to
 * check their wifi over a decision the server made on purpose.
 */
function messageFor(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'permission-denied') {
    return 'That change was not allowed, so it has been undone. You may not have permission to make it.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'That change could not reach the server, so it has been undone. Check your connection and try again.';
  }
  return 'That change could not be saved, so it has been undone.';
}

/**
 * The subject, then everyone above them. Deduplicated, because a chain that
 * names the subject would make `array-contains` ambiguous about why a record
 * matched.
 */
function readableByFor(employeeId: string): string[] {
  const chain = activeReader?.chainFor?.(employeeId) ?? [];
  return Array.from(new Set([employeeId, ...chain]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Derive what to store from the merged array the caller saved.
 *
 * Computed against the seed rather than against the previous value, so an
 * overlay never drifts: whatever the caller passes in, the stored deviation is
 * exactly the difference between the seed and that.
 */
function deriveOverlay<T extends Identified>(seed: T[], next: T[]): Overlay<T> {
  const seedById = new Map(seed.map((item) => [item.id, stableJson(item)]));
  const overlay: Overlay<T> = [];

  for (const item of next) {
    const seeded = seedById.get(item.id);
    if (seeded === undefined || seeded !== stableJson(item)) {
      overlay.push({ id: item.id, record: item });
    }
  }

  const nextIds = new Set(next.map((item) => item.id));
  for (const item of seed) {
    if (!nextIds.has(item.id)) overlay.push({ id: item.id, deleted: true });
  }

  return overlay;
}

/** The seed with the overlay applied: edits and additions in, deletions out. */
function mergeOverlay<T extends Identified>(seed: T[], overlay: Overlay<T>): T[] {
  const byId = new Map<string, T>(seed.map((item) => [item.id, item]));
  for (const entry of overlay) {
    if (entry.deleted) byId.delete(entry.id);
    else if (entry.record) byId.set(entry.id, entry.record);
  }
  return Array.from(byId.values());
}

export function persistentCollection<T extends Identified>(
  baseKey: string,
  changedEvent: string,
  seed: () => T[],
  /**
   * Slug identifying this store inside `org_records`. Stable: it is half of
   * every document id this store has ever written, so renaming one orphans its
   * records.
   */
  storeKey: string,
  /** Who may read it. Defaults to the organisation, which is what every
   * store was before `payrollRuns` needed narrowing. */
  readScope: StoreReadScope = 'org',
): PersistentCollection<T> {
  // A new key on purpose. The old one holds the *merged* array, and reading
  // that back as an overlay would resurrect every record this organisation had
  // deleted — the seed would supply it and nothing would tombstone it. The
  // migration below moves what can be moved instead.
  const overlayKey = `${baseKey}.overlay`;
  /** What the server last told us, so a save only writes what actually moved. */
  let lastPushed: Map<string, string> | null = null;

  /**
   * Where this store's cache lives: the browser for an organisation-wide
   * store, the tab for a narrowed one.
   *
   * A narrowed store's cache is exactly what the rules exist to keep from the
   * wrong reader. In localStorage it was one entry per organisation, shared by
   * every account signed in on the browser — an administrator's tab hydrated
   * every payslip and expense claim into it, and an employee's tab next door
   * read that copy back (and was told to re-read it by the `storage` event).
   * The server refused the employee the records; the browser handed them over
   * anyway. sessionStorage is per tab, and so is the session (auth uses
   * `browserSessionPersistence`), so the cache now lives exactly as long as
   * the reader it was fetched for. Nothing is lost: these stores are
   * Firestore-backed, and a new tab is a new sign-in that hydrates afresh.
   */
  const narrowed = readScope !== 'org';
  function cache(): Storage {
    return narrowed ? window.sessionStorage : window.localStorage;
  }
  if (narrowed && typeof window !== 'undefined') {
    // What an older build left behind: the last reader's copy, whoever that
    // was. Removed rather than migrated — the server holds the records, and
    // migrating it would hand this tab somebody else's.
    try {
      window.localStorage.removeItem(orgScopedKey(overlayKey));
      window.localStorage.removeItem(orgScopedKey(baseKey));
    } catch {
      // storage refused: nothing there to leak either
    }
  }

  function notify() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(changedEvent));
  }

  function readOverlay(): Overlay<T> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = cache().getItem(orgScopedKey(overlayKey));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as Overlay<T>) : [];
      }
      if (narrowed) return [];
      // One-time migration off the pre-Firestore key, which held the merged
      // array. Everything an organisation added or edited is recoverable from
      // it; deletions are not, because a merged array cannot distinguish
      // "removed" from "never there". Those records come back, once.
      const legacy = window.localStorage.getItem(orgScopedKey(baseKey));
      if (!legacy) return [];
      const parsedLegacy = JSON.parse(legacy) as unknown;
      if (!Array.isArray(parsedLegacy)) return [];
      const migrated = deriveOverlay(seed(), parsedLegacy as T[]).filter((entry) => !entry.deleted);
      writeOverlay(migrated);
      return migrated;
    } catch {
      return [];
    }
  }

  function writeOverlay(overlay: Overlay<T>) {
    if (typeof window === 'undefined') return;
    try {
      cache().setItem(orgScopedKey(overlayKey), JSON.stringify(overlay));
    } catch {
      // Quota or private-mode failure: the in-memory value the caller already
      // holds still stands for this session, and the server write below is
      // what actually persists it.
    }
  }

  /**
   * Push the entries that moved.
   *
   * Optimistic and asynchronous: the local write and the change event have
   * already happened, so the page never waits on the network to show what the
   * user just did. A failure is warned about rather than thrown — the same
   * choice `publishOrgSetting` makes, and for the same reason.
   */
  async function push(overlay: Overlay<T>, before: Overlay<T> = overlay) {
    const orgKey = getActiveOrgKey();
    if (!orgKey) return;

    const nextState = new Map(
      overlay.map((entry) => [entry.id, entry.deleted ? ' deleted' : stableJson(entry.record)]),
    );
    const previous = lastPushed ?? new Map<string, string>();

    const changed = [...nextState.entries()].filter(([id, json]) => previous.get(id) !== json);
    // An id that had an overlay entry and no longer does is back to its seed
    // value, which the server has to be told about or it goes on serving the
    // edit.
    const reverted = [...previous.keys()].filter((id) => !nextState.has(id));

    if (changed.length === 0 && reverted.length === 0) return;

    try {
      const batch = writeBatch(db);
      for (const [id] of changed) {
        const entry = overlay.find((item) => item.id === id) as OverlayEntry<T>;
        const record = entry.record as (T & { employeeId?: string; status?: string }) | undefined;
        batch.set(doc(db, ORG_RECORDS_COLLECTION, `${orgKey}__${storeKey}__${id}`), {
          orgId: orgKey,
          store: storeKey,
          recordId: id,
          deleted: Boolean(entry.deleted),
          data: entry.deleted ? '' : stableJson(entry.record),
          // Lifted out for firestore.rules, which cannot read into `data`.
          // Absent rather than null where the record has no such field, so the
          // rules can test presence.
          ...(record?.employeeId ? { employeeId: record.employeeId } : {}),
          ...(record?.status ? { status: record.status } : {}),
          // Who may read this record: its subject, plus everyone above them in
          // the reporting tree. Denormalised because rules cannot walk
          // `reportingManagerId` — the directory it lives in is
          // localStorage-backed, so it is a claim the client makes about
          // itself. Same reasoning and the same shape as `managerChainIds` on
          // leave documents (src/lib/accessBackfill.ts).
          //
          // Stamped for every store, not only the narrowed ones. It costs an
          // array of two or three ids and it means narrowing a further store
          // later is a rules change rather than a backfill.
          ...(record?.employeeId ? { readableBy: readableByFor(record.employeeId) } : {}),
        });
      }
      for (const id of reverted) {
        batch.set(doc(db, ORG_RECORDS_COLLECTION, `${orgKey}__${storeKey}__${id}`), {
          orgId: orgKey,
          store: storeKey,
          recordId: id,
          deleted: false,
          data: '',
          reverted: true,
        });
      }
      await batch.commit();
      lastPushed = nextState;
    } catch (err) {
      console.warn(`[org-records] could not publish "${storeKey}":`, err);
      rollback(before, overlay, err);
    }
  }

  /**
   * Put the cache back when the server refused the write it was showing.
   *
   * `save()` is optimistic: it writes the cache, fires the change event and
   * returns, and the commit follows without being awaited. That is deliberate
   * and worth keeping — a decision should not wait on a round trip. What was
   * not deliberate is what happened when the commit FAILED: the catch above
   * warned to a console nobody has open, and the cache went on showing the
   * change. The row stayed Approved, survived reloads, and looked exactly like
   * a decision that had landed. QA filed it as R4-M1 and the PRD as gate G7:
   * "the UI can never show saved/approved for data the database rejected".
   *
   * It matters more since the authority rules arrived. A refusal used to mean
   * the network was down; now an employee approving their own expense claim is
   * refused BY DESIGN, and that refusal has to reach them.
   *
   * Two things this deliberately does not do:
   *
   * It does not roll back if something newer has been saved since. The commit
   * is not awaited, so a second edit can land while the first is in flight;
   * restoring a snapshot from before it would silently undo work the user
   * watched succeed. The newer save has its own push and its own rollback, so
   * the right thing here is to leave it alone.
   *
   * And it does not touch `lastPushed`, which still says what the server last
   * confirmed. Advancing it on a failure would make the next save think this
   * change had landed and skip re-sending it.
   *
   * What it always does is say so. The restore is conditional; the telling is
   * not. This used to return early before the event too, so whenever the cache
   * had moved on — a colleague's write arriving through the subscription is
   * enough — a refusal was silent. The SDK's own snapshot then dropped the
   * refused record, and the change simply vanished from the page with nothing
   * to explain it: G7's failure mode, reached through the busy case rather than
   * the quiet one. Found by write-failure-rollback.spec.ts in a full run.
   */
  function rollback(before: Overlay<T>, attempted: Overlay<T>, err: unknown) {
    if (typeof window === 'undefined') return;
    if (stableJson(readOverlay()) === stableJson(attempted)) {
      writeOverlay(before);
      notify();
    }
    window.dispatchEvent(
      new CustomEvent(ORG_RECORDS_WRITE_FAILED_EVENT, {
        detail: { store: storeKey, message: messageFor(err) },
      }),
    );
  }

  const collection: PersistentCollection<T> = {
    changedEvent,

    get() {
      return mergeOverlay(seed(), readOverlay());
    },

    save(next) {
      // Read BEFORE the optimistic write, because it is what the rollback
      // below puts back if the server refuses this one.
      const before = readOverlay();
      const overlay = deriveOverlay(seed(), next);
      writeOverlay(overlay);
      notify();
      void push(overlay, before);
      return next;
    },

    update(fn) {
      return collection.save(fn(collection.get()));
    },
  };

  const registration: RegisteredStore = {
    storeKey,
    readScope,
    hydrate(entries) {
      const overlay: Overlay<T> = [];
      const state = new Map<string, string>();
      for (const entry of entries) {
        if (entry.deleted) {
          overlay.push({ id: entry.id, deleted: true });
          state.set(entry.id, ' deleted');
          continue;
        }
        if (!entry.json) continue; // a reverted entry: back to its seed value
        try {
          overlay.push({ id: entry.id, record: JSON.parse(entry.json) as T });
          state.set(entry.id, entry.json);
        } catch {
          // A record this build cannot parse is skipped rather than dropped
          // from the server: the seed value stands until somebody looks.
        }
      }
      const incoming = JSON.stringify(overlay);
      if (typeof window !== 'undefined') {
        if (cache().getItem(orgScopedKey(overlayKey)) === incoming) {
          lastPushed = state;
          return;
        }
      }
      writeOverlay(overlay);
      lastPushed = state;
      notify();
    },
  };
  registry.push(registration);
  // Registered after the sync started — see the note on `activeOrgKey`.
  if (activeOrgKey) subscribeStore(registration, activeOrgKey);

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === orgScopedKey(overlayKey)) notify();
    });
  }

  return collection;
}

/**
 * Subscribe every registered store to its organisation's records.
 *
 * One listener per store rather than one for the whole organisation: attendance
 * alone is thousands of documents a year, and a page that only needs the ticket
 * list should not stream them. Called from the auth provider once `orgId` is
 * known, and torn down on sign-out.
 *
 * Stores that register later — every lazy-loaded page — subscribe themselves,
 * because `activeOrgKey` outlives this call.
 */
export function startSharedCollectionsSync(
  orgKey: string,
  reader: OrgRecordsReader = { isOrgAdmin: false },
): () => void {
  stopSharedCollectionsSync();
  if (!orgKey) return () => {};

  activeReader = reader;
  activeOrgKey = orgKey;
  registry.forEach((store) => subscribeStore(store, orgKey));
  return stopSharedCollectionsSync;
}

/**
 * Tell the running sync which employee this account is, once that is known.
 *
 * The reader is handed to `startSharedCollectionsSync` at sign-in, and the
 * employee id in it comes from the `employee_links` cache — which is empty
 * until that document's first snapshot lands, because `startEmployeeLinkSync`
 * starts beside this and not before it. So on any sign-in without a warm cache
 * (a new tab, a new browser, a different account in this one) the `self`
 * stores subscribed as `~nobody~` and nothing ever asked again: a manager's
 * expense queue was empty for their own reports' claims, and an employee's own
 * payslips and claims never arrived from the server. It went unnoticed while
 * the narrowed caches were shared across the browser's tabs, because another
 * tab's copy filled the gap — which was the leak a2c0da6 closed.
 *
 * Only the `self` stores are resubscribed; nothing else depends on who the
 * reader is. A no-op when the id has not changed or no sync is running.
 */
export function setOrgRecordsReaderEmployee(employeeId: string | null): void {
  if (!activeReader || !activeOrgKey) return;
  if ((activeReader.employeeId ?? null) === employeeId) return;
  activeReader = { ...activeReader, employeeId };
  const orgKey = activeOrgKey;
  registry.forEach((store) => {
    if (store.readScope === 'self') subscribeStore(store, orgKey);
  });
}

export function stopSharedCollectionsSync(): void {
  activeOrgKey = null;
  activeReader = null;
  listeners.forEach((unsub) => unsub());
  listeners.clear();
}
