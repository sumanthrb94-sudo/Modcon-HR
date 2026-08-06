import { useEffect, useMemo, useState } from 'react';
import {
    ShieldCheck,
    Users,
    UserCog,
    Building2,
    Briefcase,
    Wallet,
    Loader2,
    ShieldAlert,
    Search,
    Trash2,
    FileText,
    UserPlus,
    Copy,
    Check,
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { resolveOrgKeyForProfile } from '@/lib/orgScope';
import {
    inviteAccount,
    friendlyInviteError,
    INVITABLE_ROLES,
    type InviteAccountResult,
} from '@/lib/accountInvites';
import { useAuth, ADMIN_EMAILS, type UserProfile, type UserRole } from '@/lib/auth';
import { setEmployeeDocumentStatus, useEmployeeDocuments } from '@/lib/employeeDocuments';
import type { EmployeeDocument, DocumentStatus } from '@/types';
import { getEmployeeName } from '@/data/employees';
import {
    PageHeader,
    StatCard,
    Card,
    CardHeader,
    Badge,
    Table,
    type Column,
    SearchInput,
    Select,
    Avatar,
    EmptyState,
    Button,
    Modal,
} from '@/components/ui';
import { useEmployees, useJobOpenings, usePayrollRuns, useExpenses } from '@/lib/useFirestore';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';

const ROLE_LABEL: Record<UserRole, string> = {
    admin: 'Admin',
    hr: 'HR Manager',
    manager: 'Manager',
    employee: 'Employee',
};

const ROLE_TONE: Record<UserRole, 'violet' | 'blue' | 'amber' | 'gray'> = {
    admin: 'violet',
    hr: 'blue',
    manager: 'amber',
    employee: 'gray',
};

// ---------------------------------------------------------------------------
// Live user directory (Firebase Auth users mirrored into Firestore `users`)
// ---------------------------------------------------------------------------
/** `lastLoginAt` is a Firestore Timestamp; 0 for an account that has never
 *  signed in, which sorts it last. */
function loginSeconds(value: unknown): number {
    if (value && typeof value === 'object' && 'seconds' in value) {
        return Number((value as { seconds?: unknown }).seconds ?? 0);
    }
    return 0;
}

/**
 * Every account this administrator may see.
 *
 * Platform admins and super admins list unfiltered — they administer every
 * organisation, which is what separates `admin` from `hr`. An HR manager
 * administers one, so their query carries `where('orgId','==',...)`: the rules
 * evaluate a list against every document it returns and fail the whole query if
 * one belongs to another tenant, so the filter is what makes the read legal
 * rather than an optimisation.
 *
 * Ordering moved into JS. `where` + `orderBy` needs a composite index, and this
 * collection is one document per account — small enough that sorting it here
 * costs nothing and keeps a global index deploy out of a per-tenant fix.
 */
function useUserDirectory() {
    const { profile, isAdmin, isSuperAdmin } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);

    const crossOrg = isAdmin || isSuperAdmin;
    const orgKey = resolveOrgKeyForProfile(profile);

    useEffect(() => {
        const q = crossOrg
            ? query(collection(db, 'users'))
            : query(collection(db, 'users'), where('orgId', '==', orgKey));
        const unsub = onSnapshot(
            q,
            (snap) => {
                setUsers(
                    snap.docs
                        .map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
                        .sort((a, b) => loginSeconds(b.lastLoginAt) - loginSeconds(a.lastLoginAt)),
                );
                setLoading(false);
            },
            () => setLoading(false),
        );
        return unsub;
    }, [crossOrg, orgKey]);

    return { users, loading };
}

export function AdminDashboardPage() {
    const { profile, isAdmin, isSuperAdmin } = useAuth();
    const directoryRevision = useEmployeeDirectoryRevision();
    const { users: allUsers, loading: usersLoading } = useUserDirectory();

    // Creating an account for a colleague. This is the only way an ordinary
    // employee gets one now: self-registration produced an account with no
    // orgId, which used to resolve to the default organisation and read its
    // data (G7 in docs/tenant-isolation-spec.md). Removing it closed the hole
    // and left onboarding with nowhere to go — this is that way, and it stamps
    // the organisation at creation so an unassigned account never exists.
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteName, setInviteName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('employee');
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState('');
    const [invited, setInvited] = useState<InviteAccountResult | null>(null);
    const [pwCopied, setPwCopied] = useState(false);

    function openInvite() {
        setInviteName('');
        setInviteEmail('');
        setInviteRole('employee');
        setInviteError('');
        setInvited(null);
        setPwCopied(false);
        setInviteOpen(true);
    }

    async function submitInvite() {
        if (!profile?.uid) return;
        setInviting(true);
        setInviteError('');
        try {
            setInvited(await inviteAccount({
                name: inviteName,
                email: inviteEmail,
                role: inviteRole,
                // The inviter's own organisation, never chosen in the form.
                //
                // Platform and super admins genuinely belong to no single org —
                // they administer every one — so resolveOrgKeyForProfile stands
                // in for them: the org a super admin last switched to, and the
                // default tenant for a platform admin.
                //
                // An HR administrator gets no such substitution. Passing them
                // through the same resolver turned "this account has no
                // organisation" into 'default' before inviteAccount could see
                // it, which made its refusal unreachable and would have seeded
                // the incumbent tenant with someone else's colleague. Handing
                // over the raw value is what lets that guard fire.
                orgId: isAdmin || profile.superAdmin
                    ? resolveOrgKeyForProfile(profile)
                    : (profile.orgId ?? ''),
            }, profile.uid));
        } catch (err) {
            setInviteError(friendlyInviteError(err));
        } finally {
            setInviting(false);
        }
    }
    const { data: allEmployees, loading: empLoading } = useEmployees();
    const { data: allJobs } = useJobOpenings();
    const { data: allPayrollRuns } = usePayrollRuns();
    const { data: allExpenses } = useExpenses();

    // These Firestore collections (users aside) have no orgId field at all —
    // they structurally belong to the default/legacy org only. A non-default
    // org's admin doesn't own that data, so it renders empty for them rather
    // than showing the default org's real numbers. Super admins and the
    // default org's own admins see everything, unchanged.
    const isDefaultOrgViewer = isSuperAdmin || !profile?.orgId;
    const employees = isDefaultOrgViewer ? allEmployees : [];
    const jobs = isDefaultOrgViewer ? allJobs : [];
    const payrollRuns = isDefaultOrgViewer ? allPayrollRuns : [];
    const expenses = isDefaultOrgViewer ? allExpenses : [];
    const users = useMemo(
        () => (isSuperAdmin ? allUsers : allUsers.filter((u) => (u.orgId ?? undefined) === profile?.orgId)),
        [allUsers, isSuperAdmin, profile?.orgId],
    );

    const [search, setSearch] = useState('');
    const [docSearch, setDocSearch] = useState('');
    const [docStatusFilter, setDocStatusFilter] = useState('Pending');
    // The whole organisation's filed documents. Org-scoped by the query, which
    // is not merely a narrowing: the rules fail a list whole if one document in
    // it belongs to another tenant.
    const { documents: allDocuments } = useEmployeeDocuments(profile);

    const filteredDocuments = useMemo(() => {
        return allDocuments.filter((d) => {
            const employeeName = getEmployeeName(d.employeeId).toLowerCase();
            const documentName = d.name.toLowerCase();
            const query = docSearch.trim().toLowerCase();

            const matchesSearch = !query ||
                employeeName.includes(query) ||
                documentName.includes(query) ||
                d.employeeId.toLowerCase().includes(query);

            const matchesStatus = !docStatusFilter || d.status === docStatusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [allDocuments, docSearch, docStatusFilter, directoryRevision]);

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return users;
        return users.filter(
            (u) => u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
        );
    }, [users, search, directoryRevision]);

    const adminCount = users.filter((u) => u.role === 'admin').length;
    const activeJobs = jobs.filter((j) => j.status === 'Open').length;
    const pendingExpenses = expenses.filter((e) => e.status === 'Submitted').length;
    const lastPayrollRun = payrollRuns[0];

    const documentColumns: Column<EmployeeDocument>[] = [
        {
            key: 'employeeId',
            header: 'Employee',
            render: (d) => (
                <div className="flex items-center gap-3">
                    <div>
                        <p className="font-semibold text-ink-900 text-sm">{getEmployeeName(d.employeeId)}</p>
                        <p className="text-xs text-ink-400">{d.employeeId}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'name',
            header: 'Document',
            render: (d) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <FileText size={16} />
                    </div>
                    <div>
                        <p className="font-semibold text-ink-900 text-sm">{d.name}</p>
                        <p className="text-xs text-ink-400">{d.type} · {d.size}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (d) => (
                <select
                    className="input !py-1 !text-xs w-32"
                    value={d.status}
                    onChange={(event) => void setEmployeeDocumentStatus(profile, d.id, event.target.value as DocumentStatus)}
                >
                    <option value="Verified">Verified</option>
                    <option value="Pending">Pending</option>
                    <option value="Expired">Expired</option>
                </select>
            ),
        },
        {
            key: 'uploaded',
            header: 'Uploaded',
            render: (d) => <span className="text-sm text-ink-600">{d.uploaded}</span>,
        },
    ];

    // An HR Manager administers their own company but is not a platform admin,
    // so Admin is not theirs to hand out — including to themselves, which is
    // what makes this a privilege boundary rather than a UI nicety.
    const assignableRoles: UserRole[] = isAdmin
        ? ['employee', 'manager', 'hr', 'admin']
        : ['employee', 'manager', 'hr'];

    async function setRole(uid: string, role: UserRole) {
        if (!assignableRoles.includes(role)) return;
        await updateDoc(doc(db, 'users', uid), { role });
    }

    async function removeUser(uid: string, email: string) {
        if (ADMIN_EMAILS.includes(email.toLowerCase())) return; // never allow removing hard-coded admins
        if (!window.confirm(`Remove ${email} from the directory? Their auth account is unaffected.`)) return;
        await deleteDoc(doc(db, 'users', uid));
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
                <Badge tone={ROLE_TONE[u.role] ?? 'gray'}>{ROLE_LABEL[u.role] ?? 'Employee'}</Badge>
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
                            {assignableRoles.map((role) => (
                                <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                            ))}
                            {/* An HR Manager cannot grant Admin, but must still see
                                the current value of a row that already holds it. */}
                            {!assignableRoles.includes(u.role) ? (
                                <option value={u.role} disabled>{ROLE_LABEL[u.role]}</option>
                            ) : null}
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
                subtitle={`Signed in as ${profile?.email ?? ''} · ${
                    isAdmin ? 'full platform administration' : 'administration for your organisation'
                }`}
                actions={
                    <Button icon={<UserPlus size={16} />} onClick={openInvite}>
                        Create account
                    </Button>
                }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Users" value={String(users.length)} icon={<Users size={18} />} />
                <StatCard label="Admins" value={String(adminCount)} icon={<UserCog size={18} />} />
                <StatCard label="Employees on record" value={String(employees.length)} icon={<Building2 size={18} />} />
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
                            description="Create one with the button above — accounts are no longer self-registered."
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

            <Card>
                <CardHeader
                    title="Document Status Management"
                    subtitle="Change a document status here and the employee documents table updates automatically."
                />
                <div className="px-5 pb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-grow max-w-md">
                        <SearchInput
                            value={docSearch}
                            onChange={setDocSearch}
                            placeholder="Search employee or document name…"
                        />
                    </div>
                    <div className="flex items-center gap-2 sm:ml-auto">
                        <span className="text-xs font-semibold text-ink-500 uppercase tracking-wide shrink-0">Status:</span>
                        <Select
                            value={docStatusFilter}
                            onChange={setDocStatusFilter}
                            options={[
                                { label: 'All Statuses', value: '' },
                                { label: 'Pending Verification', value: 'Pending' },
                                { label: 'Verified', value: 'Verified' },
                                { label: 'Expired', value: 'Expired' },
                            ]}
                            className="w-48"
                        />
                    </div>
                </div>
                {filteredDocuments.length === 0 ? (
                    <div className="p-8 border-t border-ink-100">
                        <EmptyState
                            title="No documents match"
                            description="Adjust your search or status filter to see other documents."
                        />
                    </div>
                ) : (
                    <Table columns={documentColumns} data={filteredDocuments} keyExtractor={(d) => d.id} />
                )}
            </Card>

            <Modal
                open={inviteOpen}
                onClose={() => setInviteOpen(false)}
                title="Create an account"
                subtitle={invited ? undefined : 'For someone in your organisation.'}
            >
                {invited ? (
                    <div className="space-y-3 text-sm">
                        <p className="text-ink-700">
                            <span className="font-mono">{invited.email}</span> can now sign in.
                        </p>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1.5">
                                Temporary password
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 rounded-lg bg-ink-50 px-3 py-2 font-mono text-sm">
                                    {invited.tempPassword}
                                </code>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={pwCopied ? <Check size={14} /> : <Copy size={14} />}
                                    onClick={() => {
                                        void navigator.clipboard.writeText(invited.tempPassword);
                                        setPwCopied(true);
                                    }}
                                >
                                    {pwCopied ? 'Copied' : 'Copy'}
                                </Button>
                            </div>
                            {/* Shown once and never stored. There is no email delivery in
                                this app, so say so rather than implying one. */}
                            <p className="mt-1.5 text-xs text-ink-400">
                                Shown once — nothing emails it. Pass it on, and have them change it.
                            </p>
                        </div>
                        {invited.linkedEmployeeId ? (
                            <p className="text-xs text-emerald-700">
                                Linked to employee record {invited.linkedEmployeeId}, so they can see their own
                                payslips and leave.
                            </p>
                        ) : (
                            <p className="text-xs text-amber-700">
                                {invited.linkNote} Until it is linked they cannot see their own payslips or leave.
                            </p>
                        )}
                        <div className="flex justify-end pt-1">
                            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Done</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="label" htmlFor="invite-name">Full name</label>
                            <input
                                id="invite-name"
                                className="input"
                                placeholder="Their name"
                                value={inviteName}
                                onChange={(e) => { setInviteName(e.target.value); setInviteError(''); }}
                            />
                        </div>
                        <div>
                            <label className="label" htmlFor="invite-email">Work email</label>
                            <input
                                id="invite-email"
                                type="email"
                                className="input"
                                placeholder="them@company.com"
                                value={inviteEmail}
                                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-ink-700 mb-1">Role</label>
                            <Select
                                ariaLabel="Role"
                                value={inviteRole}
                                onChange={(v) => setInviteRole(v as UserRole)}
                                options={INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                            />
                            {/* Admin is absent on purpose: it is granted on an existing
                                profile by an existing admin, never handed out at creation.
                                Same restriction as role_assignments and the /users rules. */}
                            <p className="mt-1 text-xs text-ink-400">
                                Admin is not granted here — change it on the account afterwards if needed.
                            </p>
                        </div>

                        {inviteError ? <p className="text-sm text-rose-600">{inviteError}</p> : null}

                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
                            <Button onClick={submitInvite} disabled={inviting || !inviteEmail.trim()}>
                                {inviting ? <Loader2 className="animate-spin" size={16} /> : 'Create account'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
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
