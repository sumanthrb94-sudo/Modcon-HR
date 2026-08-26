/**
 * Firestore Seed Utility
 *
 * Call `seedFirestore()` from a dev-only UI or browser console to push all
 * static mock data into Firestore. It uses `setDoc` with the existing IDs so
 * it is idempotent — re-running it overwrites existing docs without creating
 * duplicates.
 *
 * Usage (browser console):
 *   import { seedFirestore } from '@/lib/seed';
 *   seedFirestore().then(() => console.log('done'));
 */

import { writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';

// Static data imports
import { employees } from '@/data/employees';
import { attendanceRecords, regularizationRequests } from '@/data/attendance';
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
            if (!id) {
                // Silently dropping these would make a partial seed look complete.
                throw new Error(`[seed] ${collectionPath}: a record is missing its "id"`);
            }
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

export async function seedFirestore(
    onProgress?: (msg: string) => void,
): Promise<void> {
    const log = (msg: string) => {
        console.log(`[seed] ${msg}`);
        onProgress?.(msg);
    };

    const collections: Array<{ name: string; data: Array<{ id?: string }> }> = [
        { name: 'employees', data: employees },
        { name: 'attendance', data: attendanceRecords },
        { name: 'leave_requests', data: leaveRequests },
        {
            name: 'leave_balances',
            data: leaveBalances.map((b) => ({
                ...b,
                id: `${b.employeeId}_${b.type.replace(/\s+/g, '_')}`,
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
        { name: 'regularizations', data: regularizationRequests },
    ];

    // Collect failures rather than swallowing them: previously every collection
    // could fail and the caller still saw a resolved promise, which the Settings
    // UI reported as "All collections seeded successfully".
    const failures: string[] = [];

    for (const col of collections) {
        try {
            log(`Seeding ${col.name}…`);
            await batchWrite(col.name, col.data);
        } catch (err) {
            failures.push(col.name);
            log(`⚠️  Failed ${col.name}: ${String(err)}`);
        }
    }

    if (failures.length > 0) {
        throw new Error(
            `Seeding failed for ${failures.length} of ${collections.length} collections: ${failures.join(', ')}`,
        );
    }

    log('✅ Seeding complete.');
}
