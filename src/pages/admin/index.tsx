import { useEffect, useMemo, useState } from 'react';
import {
    ShieldCheck,
    Users,
    UserCog,
    Building2,
    Briefcase,
    Loader2,
    ShieldAlert,
    Trash2,
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth, ADMIN_EMAILS, type UserProfile, type UserRole } from '@/lib/auth';
import {
    PageHeader,
    StatCard,
    Card,
    CardHeader,
    Badge,
    Table,
    type Column,
    SearchInput,
    Avatar,
    EmptyState,
} from '@/components/ui';
import { useEmployees, useJobOpenings, usePayrollRuns, useExpenses } from '@/lib/useFirestore';

// ---------------------------------------------------------------------------
// Live user directory (Firebase Auth users mirrored into Firestore `users`)
// ---------------------------------------------------------------------------
function useUserDirectory() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'users'), orderBy('lastLoginAt', 'desc'));
        const unsub = onSnapshot(
            q,
            (snap) => {
                setUsers(snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id })));
                setLoading(false);
            },
            () => setLoading(false),
        );
        return unsub;
    }, []);

    return { users, loading };
}

export function AdminDashboardPage() {
    const { profile } = useAuth();
    const { users, loading: usersLoading } = useUserDirectory();
    const { data: employees, loading: empLoading } = useEmployees();
    const { data: jobs } = useJobOpenings();
    const { data: payrollRuns } = usePayrollRuns();
    const { data: expenses } = useExpenses();

    const [search, setSearch] = useState('');

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return users;
        return users.filter(
            (u) => u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
        );
    }, [users, search]);

    const [actionError, setActionError] = useState('');

    const adminCount = users.filter((u) => u.role === 'admin').length;
    const activeJobs = jobs.filter((j) => j.status === 'Open').length;
    const pendingExpenses = expenses.filter((e) => e.status === 'Submitted').length;
    // Firestore returns documents in document-id order, so `payrollRuns[0]` was
    // `pr-2025-12` — the OLDEST run — under a "Last payroll run" label.
    const lastPayrollRun = useMemo(
        () => [...payrollRuns].sort((a, b) => b.month.localeCompare(a.month))[0],
        [payrollRuns],
    );

    async function setRole(uid: string, role: UserRole) {
        setActionError('');
        try {
            await updateDoc(doc(db, 'users', uid), { role });
        } catch (err) {
            // A rules rejection here used to fail silently, leaving the select
            // showing a role that was never persisted.
            setActionError(`Could not update role: ${(err as Error).message}`);
        }
    }

    async function removeUser(uid: string, email: string) {
        if (ADMIN_EMAILS.includes(email.toLowerCase())) return; // never allow removing hard-coded admins
        if (!window.confirm(`Remove ${email} from the directory? Their auth account is unaffected.`)) return;
        setActionError('');
        try {
            await deleteDoc(doc(db, 'users', uid));
        } catch (err) {
            setActionError(`Could not remove ${email}: ${(err as Error).message}`);
        }
    }

    const columns: Column<UserProfile>[] = [
        {
            key: 'user',
            header: 'User',
            render: (u) => (
                <div className="flex items-center gap-3">
                    <Avatar name={u.displayName || u.email} size="sm" />
                    <div>
                        <p className="font-semibold text-ink-900 text-sm">{u.displayName || '—'}</p>
                        <p className="text-xs text-ink-400">{u.email}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'role',
            header: 'Role',
            render: (u) => (
                <Badge tone={u.role === 'admin' ? 'violet' : 'gray'}>
                    {u.role === 'admin' ? 'Admin' : 'Employee'}
                </Badge>
            ),
        },
        {
            key: 'protected',
            header: 'Source',
            render: (u) =>
                ADMIN_EMAILS.includes(u.email.toLowerCase()) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                        <ShieldCheck size={13} /> Fixed admin
                    </span>
                ) : (
                    <span className="text-xs text-ink-400">Self-registered</span>
                ),
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (u) => {
                const isFixedAdmin = ADMIN_EMAILS.includes(u.email.toLowerCase());
                return (
                    <div className="flex items-center gap-2">
                        <select
                            className="input !py-1 !text-xs w-32"
                            value={u.role}
                            disabled={isFixedAdmin}
                            onChange={(e) => setRole(u.uid, e.target.value as UserRole)}
                        >
                            <option value="employee">Employee</option>
                            <option value="admin">Admin</option>
                        </select>
                        <button
                            type="button"
                            disabled={isFixedAdmin}
                            onClick={() => removeUser(u.uid, u.email)}
                            className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Remove from directory"
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Admin Dashboard"
                subtitle={`Signed in as ${profile?.email ?? ''} · full platform administration`}
            />

            {actionError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                    <span>{actionError}</span>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Users" value={String(users.length)} icon={<Users size={18} />} />
                <StatCard label="Admins" value={String(adminCount)} icon={<UserCog size={18} />} />
                <StatCard
                    label="Employees on record"
                    value={empLoading ? '…' : String(employees.length)}
                    icon={<Building2 size={18} />}
                />
                <StatCard label="Open Job Postings" value={String(activeJobs)} icon={<Briefcase size={18} />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                    <CardHeader
                        title="User & Role Management"
                        subtitle="Grant or revoke admin access. Fixed admins cannot be modified."
                    />
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Search by name or email…"
                        className="mb-4"
                    />
                    {usersLoading ? (
                        <div className="flex items-center justify-center py-10 text-ink-400">
                            <Loader2 className="animate-spin mr-2" size={18} /> Loading users…
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <EmptyState
                            title="No users yet"
                            description="Users appear here automatically after their first sign-in."
                        />
                    ) : (
                        <Table columns={columns} data={filteredUsers} keyExtractor={(u) => u.uid} />
                    )}
                </Card>

                <Card>
                    <CardHeader title="System Snapshot" subtitle="Live counts across modules" />
                    <div className="space-y-3">
                        <SnapshotRow label="Employees" value={employees.length} />
                        <SnapshotRow label="Open jobs" value={activeJobs} />
                        <SnapshotRow label="Pending expense claims" value={pendingExpenses} />
                        <SnapshotRow
                            label="Last payroll run"
                            value={lastPayrollRun ? lastPayrollRun.month : '—'}
                        />
                        <div className="pt-2 mt-2 border-t border-ink-100">
                            <p className="text-xs text-ink-400 leading-relaxed">
                                Admin access is restricted to designated company emails. Additional admins can be
                                promoted here; access can be revoked at any time except for fixed administrators.
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}

function SnapshotRow({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-ink-500">{label}</span>
            <span className="font-semibold text-ink-900">{value}</span>
        </div>
    );
}
