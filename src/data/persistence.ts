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

interface RegisteredStore {
  storeKey: string;
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

function subscribeStore(store: RegisteredStore, orgKey: string) {
  listeners.get(store.storeKey)?.();
  listeners.set(
    store.storeKey,
    onSnapshot(
      query(
        fsCollection(db, ORG_RECORDS_COLLECTION),
        where('orgId', '==', orgKey),
        where('store', '==', store.storeKey),
      ),
      (snap) => {
        store.hydrate(
          snap.docs.map((d) => {
            const data = d.data() as { recordId?: string; data?: string; deleted?: boolean };
            return {
              id: data.recordId ?? '',
              json: data.data || null,
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
): PersistentCollection<T> {
  // A new key on purpose. The old one holds the *merged* array, and reading
  // that back as an overlay would resurrect every record this organisation had
  // deleted — the seed would supply it and nothing would tombstone it. The
  // migration below moves what can be moved instead.
  const overlayKey = `${baseKey}.overlay`;
  /** What the server last told us, so a save only writes what actually moved. */
  let lastPushed: Map<string, string> | null = null;

  function notify() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(changedEvent));
  }

  function readOverlay(): Overlay<T> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(orgScopedKey(overlayKey));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as Overlay<T>) : [];
      }
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
      window.localStorage.setItem(orgScopedKey(overlayKey), JSON.stringify(overlay));
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
  async function push(overlay: Overlay<T>) {
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
    }
  }

  const collection: PersistentCollection<T> = {
    changedEvent,

    get() {
      return mergeOverlay(seed(), readOverlay());
    },

    save(next) {
      const overlay = deriveOverlay(seed(), next);
      writeOverlay(overlay);
      notify();
      void push(overlay);
      return next;
    },

    update(fn) {
      return collection.save(fn(collection.get()));
    },
  };

  const registration: RegisteredStore = {
    storeKey,
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
        if (window.localStorage.getItem(orgScopedKey(overlayKey)) === incoming) {
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
export function startSharedCollectionsSync(orgKey: string): () => void {
  stopSharedCollectionsSync();
  if (!orgKey) return () => {};

  activeOrgKey = orgKey;
  registry.forEach((store) => subscribeStore(store, orgKey));
  return stopSharedCollectionsSync;
}

export function stopSharedCollectionsSync(): void {
  activeOrgKey = null;
  listeners.forEach((unsub) => unsub());
  listeners.clear();
}
