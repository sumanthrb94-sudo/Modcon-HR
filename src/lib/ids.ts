/**
 * Ids for records this app creates in the browser.
 *
 * A record's id is half of its `org_records` document key
 * (`<orgKey>__<store>__<recordId>`), so two records that agree on an id are
 * one document, and the second write to it is not a second record — it is an
 * overwrite, or, when the two collapse to the same JSON, nothing at all.
 *
 * That is not hypothetical. Helpdesk minted ids from
 * `useState(57) // next ticket number`, a counter held in React state, so
 * EVERY page load in EVERY browser produced `tkt-new-57` for its first
 * ticket. Two people raising a ticket — or one person raising one in two
 * tabs — wrote the same document. The second write was silently dropped:
 * `deriveOverlay` collapses duplicate ids, the change set came out empty, and
 * `push()` returned without sending anything. No error, because nothing
 * failed. The ticket sat on screen looking saved and was gone on the next
 * reload. QA filed the symptom as a lost write and it had been read as a
 * persistence bug; persistence was behaving correctly, given two records that
 * claimed to be the same one.
 *
 * `crypto.randomUUID()` where it exists — every browser this app supports,
 * and Node 19+ for the specs. The fallback is not a nicety: `randomUUID` is
 * unavailable on an insecure origin, which is exactly where somebody testing
 * over plain HTTP on a LAN address would be, and an id generator that throws
 * there would break record creation on the machine of whoever is evaluating
 * the product.
 *
 * Firestore-generated ids (`doc(collection).id`) would also do, and are what
 * the QA hand-off suggested. They are not used because the id has to exist
 * synchronously, before the optimistic cache write, and it has to be stable
 * across the cache and the document key — which means minting it here rather
 * than asking the SDK on a path that does not await anything.
 */
export function newRecordId(prefix: string): string {
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${unique}`;
}

/**
 * The next number in a human-facing code series (`HD-2097`, and the like).
 *
 * Separate from the id on purpose. The id has to be unique or records are
 * lost; the code only has to be readable and not obviously repeat, and people
 * quote it to each other. Derived from what the organisation already holds
 * rather than from a constant, so it does not restart at the same number on
 * every page load the way the counter it replaces did.
 *
 * Still not a guarantee of uniqueness across two browsers at once — that
 * would need a server — and deliberately so: a duplicate code is a confusing
 * label, where a duplicate id is a deleted record.
 */
export function nextCodeNumber(existing: string[], prefix: string, floor: number): number {
  const highest = existing.reduce((max, code) => {
    if (!code?.startsWith(`${prefix}-`)) return max;
    const n = Number.parseInt(code.slice(prefix.length + 1), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, floor);
  return highest + 1;
}
