import { useMemo, useState } from 'react';
import { Building2, Loader2, Plus, ShieldCheck, Copy, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOrganizations } from '@/lib/useFirestore';
import { createOrganization, friendlyOrgError, type CreateOrganizationResult } from '@/lib/organizations';
import {
    PageHeader,
    StatCard,
    Card,
    CardHeader,
    Table,
    type Column,
    SearchInput,
    Modal,
    Button,
    EmptyState,
    Avatar,
} from '@/components/ui';
import type { Organization } from '@/types';

function formatCreatedAt(value: unknown): string {
    const seconds = (value as { seconds?: number } | undefined)?.seconds;
    if (!seconds) return '—';
    return new Date(seconds * 1000).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function OrganizationsPage() {
    const { profile } = useAuth();
    const { data: organizations, loading } = useOrganizations();
    const [search, setSearch] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [orgName, setOrgName] = useState('');
    const [adminName, setAdminName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [result, setResult] = useState<CreateOrganizationResult | null>(null);
    const [copied, setCopied] = useState(false);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return organizations;
        return organizations.filter(
            (o) => o.name.toLowerCase().includes(q) || o.adminEmail.toLowerCase().includes(q),
        );
    }, [organizations, search]);

    function resetForm() {
        setOrgName('');
        setAdminName('');
        setAdminEmail('');
        setFormError('');
    }

    function openCreate() {
        resetForm();
        setResult(null);
        setCreateOpen(true);
    }

    async function handleCreate() {
        if (!profile) return;
        setFormError('');
        setSubmitting(true);
        try {
            const created = await createOrganization(
                { name: orgName, adminName, adminEmail },
                profile.uid,
            );
            setResult(created);
        } catch (err) {
            setFormError(friendlyOrgError(err));
        } finally {
            setSubmitting(false);
        }
    }

    function copyCredentials() {
        if (!result) return;
        const text = `Organization: ${result.adminEmail}\nEmail: ${result.adminEmail}\nTemporary password: ${result.tempPassword}`;
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const columns: Column<Organization>[] = [
        {
            key: 'name',
            header: 'Organization',
            render: (o) => (
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <Building2 size={16} />
                    </div>
                    <div>
                        <p className="font-semibold text-ink-900 text-sm">{o.name}</p>
                        <p className="text-xs text-ink-400">{o.id}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'admin',
            header: 'Admin',
            render: (o) => (
                <div className="flex items-center gap-2">
                    <Avatar name={o.adminEmail} size="sm" />
                    <span className="text-sm text-ink-700">{o.adminEmail}</span>
                </div>
            ),
        },
        {
            key: 'createdAt',
            header: 'Created',
            render: (o) => <span className="text-sm text-ink-600">{formatCreatedAt(o.createdAt)}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Organizations"
                subtitle="Create and oversee every organization on ModCon HR. Each gets its own admin and HR system."
                actions={
                    <Button icon={<Plus size={16} />} onClick={openCreate}>
                        Create Organization
                    </Button>
                }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard label="Organizations" value={String(organizations.length)} icon={<Building2 size={18} />} />
                <StatCard label="Signed in as" value={profile?.email ?? '—'} icon={<ShieldCheck size={18} />} />
            </div>

            <Card>
                <CardHeader title="All Organizations" subtitle="Every organization created on the platform" />
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by organization or admin email…"
                    className="mb-4"
                />
                {loading ? (
                    <div className="flex items-center justify-center py-10 text-ink-400">
                        <Loader2 className="animate-spin mr-2" size={18} /> Loading organizations…
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        title="No organizations yet"
                        description="Create the first organization to provision its admin account."
                    />
                ) : (
                    <Table columns={columns} data={filtered} keyExtractor={(o) => o.id ?? o.adminEmail} />
                )}
            </Card>

            <Modal
                open={createOpen}
                onClose={() => (submitting ? null : setCreateOpen(false))}
                title={result ? 'Organization created' : 'Create Organization'}
                subtitle={
                    result
                        ? 'Share these credentials with the new admin securely. The temporary password will not be shown again.'
                        : 'This provisions a new organization and its first admin account.'
                }
                size="sm"
                footer={
                    result ? (
                        <Button variant="primary" onClick={() => setCreateOpen(false)}>Done</Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={handleCreate} disabled={submitting}>
                                {submitting ? <Loader2 className="animate-spin" size={16} /> : 'Create'}
                            </Button>
                        </>
                    )
                }
            >
                {result ? (
                    <div className="space-y-3 text-sm">
                        <div className="rounded-lg bg-ink-50 p-3 space-y-1.5">
                            <p><span className="text-ink-400">Admin email:</span> <span className="font-mono text-ink-900">{result.adminEmail}</span></p>
                            <p><span className="text-ink-400">Temporary password:</span> <span className="font-mono text-ink-900">{result.tempPassword}</span></p>
                        </div>
                        <button
                            type="button"
                            onClick={copyCredentials}
                            className="btn-secondary w-full inline-flex items-center justify-center gap-2 text-xs"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? 'Copied' : 'Copy credentials'}
                        </button>
                        <p className="text-xs text-ink-400">
                            The admin can sign in with these and start building out their organization's HR system.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-ink-500">Organization name</label>
                            <input
                                className="input mt-1"
                                value={orgName}
                                onChange={(e) => setOrgName(e.target.value)}
                                placeholder="Acme Builders"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-ink-500">Admin name</label>
                            <input
                                className="input mt-1"
                                value={adminName}
                                onChange={(e) => setAdminName(e.target.value)}
                                placeholder="Jane Doe"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-ink-500">Admin email</label>
                            <input
                                className="input mt-1"
                                type="email"
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                placeholder="admin@acme.com"
                            />
                        </div>
                        {formError && <p className="text-xs text-rose-600">{formError}</p>}
                    </div>
                )}
            </Modal>
        </div>
    );
}
