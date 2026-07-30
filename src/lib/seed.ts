/**
 * Firestore Seed Utility
 *
 * Call `seedFirestore()` from a dev-only UI or browser console to push all
 * static mock data into Firestore. It uses `setDoc` with the existing IDs so
 * it is idempotent — re-running it overwrites existing docs without creating
 * duplicates (and, per the compensation split below, without leaving a
 * stale `ctc` field behind from an older seed run).
 *
 * Employee compensation (`ctc`) is intentionally NOT written onto the
 * `employees` collection — it's split into a separate `employee_compensation`
 * collection so the broadly-readable employee directory never carries salary
 * data. See the matching admin-only rule for that collection in
 * firestore.rules.
 *
 * Usage (browser console):
 *   import { seedFirestore } from '@/lib/seed';
 *   seedFirestore().then(() => console.log('done'));
 */

import { writeBatch, doc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ORG_KEY } from './orgScope';

// Static data imports
import { employees } from '@/data/employees';
import { attendanceRecords, getRegularizationRequests } from '@/data/attendance';
import { leaveRequests, leaveBalances } from '@/data/leave';
import { payslips, payrollRuns } from '@/data/payroll';
import { jobOpenings, candidates } from '@/data/recruitment';
import { onboardings } from '@/data/onboarding';
import { goals, reviews as performanceReviews } from '@/data/performance';
import { expenseClaims } from '@/data/expenses';
import { assets } from '@/data/assets';
import { tickets } from '@/data/helpdesk';

// Firestore allows max 500 ops per batch
const BATCH_SIZE = 400;

async function batchWrite<T extends { id?: string }>(
    collectionPath: string,
    items: T[],
): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const item of chunk) {
            const id = item.id ?? '';
            if (!id) continue; // Skip items without IDs
            const ref = doc(db, collectionPath, id);
            // Remove undefined fields (Firestore doesn't accept them)
            const cleaned = Object.fromEntries(
                Object.entries(item).filter(([, v]) => v !== undefined),
            );
            batch.set(ref, cleaned);
        }
        await batch.commit();
    }
}

// Every collection `seedFirestore` writes to — kept as its own list so
// `purgeSeededFirestoreData` can delete the same set without needing the
// static mock data imports above.
const SEEDED_COLLECTION_NAMES = [
    'employees',
    'employee_compensation',
    'attendance',
    'leave_requests',
    'leave_balances',
    'payslips',
    'payroll_runs',
    'jobs',
    'candidates',
    'onboarding',
    'goals',
    'performance_reviews',
    'expenses',
    'assets',
    'helpdesk_tickets',
    'regularizations',
];

/**
 * Deletes one organisation's documents from a collection.
 *
 * Org-scoped rather than wholesale: an unfiltered delete here wiped every
 * organisation's data, so one company clearing its demo dataset took the rest
 * of the tenants with it. Documents written before multi-tenancy carry no
 * `orgId` and match no equality filter, so they are invisible to this and must
 * be given one first — see backfillOrgIds in ./orgBackfill.ts.
 */
async function batchDeleteCollection(collectionPath: string, orgKey: string): Promise<number> {
    const snap = await getDocs(
        query(collection(db, collectionPath), where('orgId', '==', orgKey)),
    );
    const refs = snap.docs.map((d) => d.ref);
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
        const chunk = refs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
    }
    return refs.length;
}

/**
 * Deletes every document in the collections `seedFirestore` populates.
 * Requires an admin-signed-in user — enforced by firestore.rules, not here.
 */
export async function purgeSeededFirestoreData(
    onProgress?: (msg: string) => void,
    orgKey: string = DEFAULT_ORG_KEY,
): Promise<void> {
    const log = (msg: string) => {
        console.log(`[purge] ${msg}`);
        onProgress?.(msg);
    };

    for (const name of SEEDED_COLLECTION_NAMES) {
        try {
            log(`Deleting ${name}…`);
            const count = await batchDeleteCollection(name, orgKey);
            log(`Deleted ${count} document(s) from ${name}.`);
        } catch (err) {
            log(`⚠️  Skipped ${name}: ${String(err)}`);
        }
    }

    log('✅ Firestore purge complete.');
}

/**
 * Every employee id above each employee in the reporting tree.
 *
 * Denormalised onto leave documents so `firestore.rules` can answer "is the
 * caller this person's manager". The rules cannot walk `reportingManagerId`
 * themselves: the directory it lives in is localStorage-backed
 * (src/data/employees.ts), so it is neither readable nor trustworthy on the
 * server. Without this the only expressible tiers are "own record" and "any
 * manager in the company" — the latter far wider than src/lib/dataScope.ts
 * allows. See docs/salary-leave-access-spec.md §4.
 *
 * The chain is a snapshot taken at write time, so it goes stale when someone
 * changes manager; whatever rewrites reporting lines must rewrite these too.
 */
function buildManagerChains(): Map<string, string[]> {
    const managerOf = new Map<string, string | null>(
        employees.map((e) => [e.id, e.reportingManagerId ?? null]),
    );

    const chains = new Map<string, string[]>();
    for (const employee of employees) {
        const chain: string[] = [];
        const seen = new Set<string>([employee.id]);
        let current = managerOf.get(employee.id) ?? null;
        // Guarded against a cycle in the reporting data (A reports to B reports
        // to A), which is reachable — reporting lines are editable from the
        // profile page. dataScope.collectSubtree guards the same way.
        while (current && !seen.has(current)) {
            chain.push(current);
            seen.add(current);
            current = managerOf.get(current) ?? null;
        }
        chains.set(employee.id, chain);
    }
    return chains;
}

export async function seedFirestore(
    onProgress?: (msg: string) => void,
    orgKey: string = DEFAULT_ORG_KEY,
): Promise<void> {
    const log = (msg: string) => {
        console.log(`[seed] ${msg}`);
        onProgress?.(msg);
    };

    // Compensation is seeded into its own admin-only collection (see
    // firestore.rules) rather than left inline on the employee record, so
    // the broadly-readable `employees` directory doesn't carry salary data.
    const employeesWithoutComp = employees.map(({ ctc: _ctc, ...rest }) => rest);
    const compensation = employees.map((e) => ({ id: e.id, employeeId: e.id, ctc: e.ctc }));

    const managerChains = buildManagerChains();

    const collections = [
        { name: 'employees', data: employeesWithoutComp },
        { name: 'employee_compensation', data: compensation },
        { name: 'attendance', data: attendanceRecords },
        {
            name: 'leave_requests',
            data: leaveRequests.map((r) => ({
                ...r,
                managerChainIds: managerChains.get(r.employeeId) ?? [],
            })),
        },
        {
            name: 'leave_balances',
            data: leaveBalances.map((b) => ({
                ...b,
                id: `${b.employeeId}_${b.type.replace(/\s+/g, '_')}`,
                managerChainIds: managerChains.get(b.employeeId) ?? [],
            })),
        },
        { name: 'payslips', data: payslips },
        { name: 'payroll_runs', data: payrollRuns },
        { name: 'jobs', data: jobOpenings },
        { name: 'candidates', data: candidates },
        { name: 'onboarding', data: onboardings },
        { name: 'goals', data: goals },
        { name: 'performance_reviews', data: performanceReviews },
        { name: 'expenses', data: expenseClaims },
        { name: 'assets', data: assets },
        { name: 'helpdesk_tickets', data: tickets },
        { name: 'regularizations', data: getRegularizationRequests() },
    ];

    for (const col of collections) {
        try {
            log(`Seeding ${col.name}…`);
            // Every seeded document is stamped with the organisation it belongs
            // to. Without this the records carry no orgId and the rules read
            // them as the default org, which is right for the legacy dataset
            // and wrong for anyone who seeds a demo into their own company.
            const scoped = (col.data as Array<{ id?: string } & Record<string, unknown>>).map(
                (item) => ({ ...item, orgId: orgKey }),
            );
            // `collections` mixes several unrelated record shapes (Employee, Payslip,
            // Ticket, ...) in one array literal, so TS can't unify a single element
            // type across them. Every item does carry an `id` plus arbitrary other
            // fields though, which is exactly what `batchWrite` needs — expressing
            // that narrows the escape hatch from a bare `any` to a shape that still
            // catches obvious mistakes (e.g. passing a non-object).
            await batchWrite(col.name, scoped);
        } catch (err) {
            log(`⚠️  Skipped ${col.name}: ${String(err)}`);
        }
    }

    log('✅ Seeding complete.');
}
