/**
 * Everything an organisation keeps here, as one file it can keep somewhere else.
 *
 * There was no way out: no backup, no export, and two one-click deletions
 * (Delete mock data, Undo payroll run) with nothing to restore from. Indian
 * payroll records have to be produced to an inspector for years, and a company
 * that wants to leave is owed its own data. This is the administrator's half
 * of that — a JSON file of every collection the app reads for the
 * organisation, fetched with the same org-filtered queries the app already
 * runs, so the rules decide exactly what it contains.
 *
 * It is not a substitute for Firestore's own point-in-time recovery, which
 * needs the Blaze plan and is a project setting rather than something code can
 * switch on.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** The collections an organisation's data lives in, all filtered on `orgId`. */
const EXPORTED_COLLECTIONS = [
  'org_records',
  'org_settings',
  'payslip_documents',
  'employee_documents',
  'attendance_stamps',
  'org_posts',
] as const;

export interface OrgExport {
  readonly format: 'modcon-hr-export';
  readonly version: 1;
  readonly orgId: string;
  readonly exportedAt: string;
  readonly collections: Record<string, { id: string; data: Record<string, unknown> }[]>;
  /** Collections the caller could not read, and why — listed, never dropped. */
  readonly skipped: { collection: string; reason: string }[];
}

function plain(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === 'function') return maybeTimestamp.toDate().toISOString();
    if (Array.isArray(value)) return value.map(plain);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

export async function exportOrganisationData(
  orgId: string,
  onProgress?: (message: string) => void,
): Promise<OrgExport> {
  const collections: OrgExport['collections'] = {};
  const skipped: OrgExport['skipped'] = [];
  for (const name of EXPORTED_COLLECTIONS) {
    try {
      onProgress?.(`Reading ${name}…`);
      const snap = await getDocs(query(collection(db, name), where('orgId', '==', orgId)));
      collections[name] = snap.docs.map((d) => ({ id: d.id, data: plain(d.data()) as Record<string, unknown> }));
      onProgress?.(`${name}: ${snap.size} document(s).`);
    } catch (err) {
      skipped.push({ collection: name, reason: String(err) });
      onProgress?.(`Skipped ${name}: ${String(err)}`);
    }
  }
  return {
    format: 'modcon-hr-export',
    version: 1,
    orgId,
    exportedAt: new Date().toISOString(),
    collections,
    skipped,
  };
}

/** Hand the export to the browser as a file. */
export function downloadExport(data: OrgExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `modcon-hr-${data.orgId}-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
