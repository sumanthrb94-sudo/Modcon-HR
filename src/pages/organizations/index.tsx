import { useMemo, useState } from 'react';
import { Building2, Loader2, Plus, ShieldCheck, Copy, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOrganizations } from '@/lib/useFirestore';
import {
    createOrganization,
    friendlyOrgError,
    findOrgAdminsToMigrate,
    migrateOrgAdminsToHr,
    setOrgHrAdministrator,
    setOrgFeature,
    type CreateOrganizationResult,
    type OrgAdminMigrationCandidate,
} from '@/lib/organizations';
import { FEATURE_FLAGS } from '@/lib/features';
import { getActiveOrgKey, switchSuperAdminOrg, DEFAULT_ORG_KEY } from '@/lib/orgScope';
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
import { APP_TIME_ZONE } from '@/lib/today';
import SubscriptionsPanel from './SubscriptionsPanel';

function formatCreatedAt(value: unknown): string {
    const seconds = (value as { seconds?: number } | undefined)?.seconds;
    if (!seconds) return '—';
    return new Date(seconds * 1000).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: APP_TIME_ZONE,
    });
}

/**
 * The flags a super admin may toggle, in declaration order.
 *
 * Empty between rollouts, which is the correct state — the mechanism exists so
 * the next change that must not reach every tenant at once has somewhere to go.
 * The Features control hides itself when there is nothing to show rather than
 * offering an empty dialog.
 */
const FLAG_LIST = Object.values(FEATURE_FLAGS);

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

    // Per-organisation feature flags: which tenants a change has reached. One
    // Firebase project means code ships to everyone at once, so staging a
    // rollout is data, not deployment — see src/lib/features.ts.
    const [featuresOrg, setFeaturesOrg] = useState<Organization | null>(null);
    const [featureSaving, setFeatureSaving] = useState('');
    const [featureError, setFeatureError] = useState('');

    function openFeatures(org: Organization) {
        setFeaturesOrg(org);
        setFeatureError('');
    }

    async function toggleFeature(org: Organization, key: string, enabled: boolean) {
        if (!org.id) return;
        setFeatureSaving(key);
        setFeatureError('');
        try {
            await setOrgFeature({ orgId: org.id, feature: key, enabled });
        } catch (err) {
            setFeatureError(
                `Could not update "${key}": ${(err as Error)?.message ?? 'unknown error'}`,
            );
        } finally {
            setFeatureSaving('');
        }
    }

    // Migration for organisations created before the first account became an
    // HR administrator. Two stages on purpose: this revokes the Admin role from
    // live accounts, so the list is shown and confirmed before anything is
    // written.
    const [migrateOpen, setMigrateOpen] = useState(false);
    const [migrateScanning, setMigrateScanning] = useState(false);
    const [migrateRunning, setMigrateRunning] = useState(false);
    const [migrateCandidates, setMigrateCandidates] = useState<OrgAdminMigrationCandidate[] | null>(null);
    const [migrateReport, setMigrateReport] = useState<{ migrated: string[]; failed: { email: string; reason: string }[] } | null>(null);
    const [migrateError, setMigrateError] = useState('');

    const migratable = (migrateCandidates ?? []).filter((c) => !c.skipReason);

    // Attaching an existing account to an organisation as its HR
    // administrator — the counterpart to Create Organization, which mints a
    // new account instead.
    const [assignOrg, setAssignOrg] = useState<Organization | null>(null);
    const [assignEmail, setAssignEmail] = useState('');
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState('');
    const [assignDone, setAssignDone] = useState<{ email: string; replaced?: string } | null>(null);

    function openAssign(org: Organization) {
        setAssignOrg(org);
        setAssignEmail('');
        setAssignError('');
        setAssignDone(null);
    }

    async function submitAssign() {
        if (!assignOrg?.id || !profile?.uid) return;
        setAssigning(true);
        setAssignError('');
        try {
            const res = await setOrgHrAdministrator(
                { orgId: assignOrg.id, orgName: assignOrg.name, email: assignEmail },
                profile.uid,
            );
            setAssignDone({ email: res.email, replaced: res.replaced });
        } catch (err) {
            setAssignError((err as Error)?.message ?? friendlyOrgError(err));
        } finally {
            setAssigning(false);
        }
    }

    async function openMigration() {
        setMigrateOpen(true);
        setMigrateReport(null);
        setMigrateError('');
        setMigrateCandidates(null);
        setMigrateScanning(true);
        try {
            setMigrateCandidates(await findOrgAdminsToMigrate(organizations));
        } catch (err) {
            setMigrateError((err as Error)?.message ?? 'Could not read the organizations.');
        } finally {
            setMigrateScanning(false);
        }
    }

    async function runMigration() {
        if (!migrateCandidates || !profile?.uid) return;
        setMigrateRunning(true);
        setMigrateError('');
        try {
            setMigrateReport(await migrateOrgAdminsToHr(migrateCandidates, profile.uid));
        } catch (err) {
            setMigrateError((err as Error)?.message ?? 'The migration did not complete.');
        } finally {
            setMigrateRunning(false);
        }
    }

    // The captured `featuresOrg` is a snapshot from the moment the dialog
    // opened, so a toggle would not re-render against it. `useOrganizations` is
    // a live subscription — resolve through it so the switch shows the value
    // that actually landed, and falls back to the capture only if the row is
    // gone.
    const liveFeaturesOrg = featuresOrg
        ? organizations.find((o) => o.id === featuresOrg.id) ?? featuresOrg
        : null;

    const activeOrgKey = getActiveOrgKey();
    const activeOrgName = organizations.find((o) => o.id === activeOrgKey)?.name;

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
        // The organisation's *name*, not the administrator's address. This line
        // read `Organization: ${result.adminEmail}`, so every handoff message a
        // super admin pasted named the organisation as an email address —
        // and `CreateOrganizationResult` carries no name, which is why the form
        // field is the source. `orgName` is still in state here because the
        // dialog stays open to show the credentials.
        const text = [
            `Organization: ${orgName.trim()}`,
            `Sign in at: ${window.location.origin}/login`,
            `Email: ${result.adminEmail}`,
            `Temporary password: ${result.tempPassword}`,
            '',
            'Change this password after the first sign-in.',
        ].join('\n');
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
            header: 'HR administrator',
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
        {
            key: 'actions',
            header: 'Actions',
            render: (o) => {
                const isActive = o.id === getActiveOrgKey();
                return (
                    <div className="flex items-center gap-2">
                    {FLAG_LIST.length > 0 && (
                        <Button variant="secondary" size="sm" onClick={() => openFeatures(o)}>
                            Features
                        </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => openAssign(o)}>
                        Set HR admin
                    </Button>
                    <Button
                        variant={isActive ? 'secondary' : 'primary'}
                        size="sm"
                        disabled={isActive}
                        onClick={() => o.id && switchSuperAdminOrg(o.id)}
                    >
                        {isActive ? 'Currently managing' : 'Manage this org'}
                    </Button>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Organizations"
                subtitle="Create and oversee every organization on ModCon HR. Each gets its own HR administrator and HR system."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" icon={<ShieldCheck size={16} />} onClick={openMigration}>
                            Review admin roles
                        </Button>
                        <Button icon={<Plus size={16} />} onClick={openCreate}>
                            Create Organization
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Organizations" value={String(organizations.length)} icon={<Building2 size={18} />} />
                <StatCard label="Signed in as" value={profile?.email ?? '—'} icon={<ShieldCheck size={18} />} />
                <StatCard
                    label="Currently managing"
                    value={activeOrgKey === DEFAULT_ORG_KEY ? 'ModCon Builders (Default)' : (activeOrgName ?? activeOrgKey)}
                    icon={<Building2 size={18} />}
                    footer={
                        activeOrgKey !== DEFAULT_ORG_KEY ? (
                            <button
                                type="button"
                                onClick={() => switchSuperAdminOrg(DEFAULT_ORG_KEY)}
                                className="text-xs font-semibold text-brand-700 hover:underline"
                            >
                                Switch back to Default
                            </button>
                        ) : null
                    }
                />
            </div>

            <Card>
                <CardHeader title="All Organizations" subtitle="Every organization created on the platform" />
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by organization or HR administrator email…"
                    className="mb-4"
                />
                {loading ? (
                    <div className="flex items-center justify-center py-10 text-ink-400">
                        <Loader2 className="animate-spin mr-2" size={18} /> Loading organizations…
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        title="No organizations yet"
                        description="Create the first organization to provision its HR administrator account."
                    />
                ) : (
                    <Table columns={columns} data={filtered} keyExtractor={(o) => o.id ?? o.adminEmail} />
                )}
            </Card>

            {/* Everything commercial about a tenant, and it is only here:
                `organizations/{orgId}` is super-admin-writable and nothing else
                is, which is what makes a trial a trial. */}
            <SubscriptionsPanel organizations={organizations} loading={loading} />

            <Modal
                open={createOpen}
                onClose={() => (submitting ? null : setCreateOpen(false))}
                title={result ? 'Organization created' : 'Create Organization'}
                subtitle={
                    result
                        ? 'Share these credentials with the new HR administrator securely. The temporary password will not be shown again.'
                        : 'This provisions a new organization and its first HR administrator account.'
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
                            <p><span className="text-ink-400">HR administrator email:</span> <span className="font-mono text-ink-900">{result.adminEmail}</span></p>
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
                            They can sign in with these and start building out their organization's HR system. The account administers that organization only — it cannot grant the Admin role or reach any other organization.
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
                            <label className="text-xs font-semibold text-ink-500">HR administrator name</label>
                            <input
                                className="input mt-1"
                                value={adminName}
                                onChange={(e) => setAdminName(e.target.value)}
                                placeholder="Jane Doe"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-ink-500">HR administrator email</label>
                            <input
                                className="input mt-1"
                                type="email"
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                placeholder="hr@acme.com"
                            />
                        </div>
                        {formError && <p className="text-xs text-rose-600">{formError}</p>}
                    </div>
                )}
            </Modal>

            <Modal
                open={migrateOpen}
                onClose={() => setMigrateOpen(false)}
                title="Organization administrator roles"
                subtitle={
                    migrateReport
                        ? 'Migration complete.'
                        : 'Organizations created before this change were given a platform Admin account, which can grant the Admin role to others. Converting them to HR administrator confines them to their own organization.'
                }
            >
                {migrateScanning ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-ink-500">
                        <Loader2 size={16} className="animate-spin" /> Checking each organization&apos;s account…
                    </div>
                ) : migrateReport ? (
                    <div className="space-y-3 text-sm">
                        <p className="text-ink-700">
                            {migrateReport.migrated.length === 0
                                ? 'No accounts needed changing.'
                                : `${migrateReport.migrated.length} account${migrateReport.migrated.length === 1 ? '' : 's'} converted to HR administrator.`}
                        </p>
                        {migrateReport.migrated.map((email) => (
                            <p key={email} className="font-mono text-xs text-ink-600">{email}</p>
                        ))}
                        {migrateReport.failed.length > 0 ? (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                                <p className="font-medium text-rose-800">Could not change:</p>
                                {migrateReport.failed.map((f) => (
                                    <p key={f.email} className="text-xs text-rose-700">{f.email} — {f.reason}</p>
                                ))}
                            </div>
                        ) : null}
                        <p className="text-xs text-ink-400">
                            Converted accounts keep their access to their own organization. They pick up the
                            change the next time their profile is read.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {migrateError ? <p className="text-sm text-rose-600">{migrateError}</p> : null}
                        {(migrateCandidates ?? []).length === 0 ? (
                            <p className="text-sm text-ink-500">No organizations with a provisioned account yet.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-72 overflow-auto">
                                {(migrateCandidates ?? []).map((c) => (
                                    <div key={c.uid} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-ink-900 truncate">{c.orgName}</p>
                                            <p className="text-xs text-ink-500 truncate font-mono">{c.email}</p>
                                        </div>
                                        {c.skipReason ? (
                                            <span className="shrink-0 text-xs text-ink-400">{c.skipReason}</span>
                                        ) : (
                                            <span className="shrink-0 text-xs font-medium text-amber-700">Admin → HR administrator</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {migratable.length > 0 ? (
                            <p className="text-xs text-ink-500">
                                This revokes the platform Admin role from {migratable.length} live account
                                {migratable.length === 1 ? '' : 's'}. They keep full access to their own organization.
                            </p>
                        ) : null}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="secondary" onClick={() => setMigrateOpen(false)}>Close</Button>
                            <Button
                                onClick={runMigration}
                                disabled={migratable.length === 0 || migrateRunning}
                                icon={migrateRunning ? <Loader2 size={15} className="animate-spin" /> : undefined}
                            >
                                {migrateRunning ? 'Converting…' : `Convert ${migratable.length || ''}`.trim()}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                open={assignOrg !== null}
                onClose={() => setAssignOrg(null)}
                title="Set HR administrator"
                subtitle={
                    assignDone
                        ? undefined
                        : `Point an existing account at ${assignOrg?.name ?? 'this organization'} as its HR administrator.`
                }
            >
                {assignDone ? (
                    <div className="space-y-3 text-sm">
                        <p className="text-ink-700">
                            <span className="font-mono">{assignDone.email}</span> is now the HR administrator for{' '}
                            <span className="font-medium">{assignOrg?.name}</span>.
                        </p>
                        {assignDone.replaced ? (
                            <p className="text-xs text-amber-700">
                                This replaced {assignDone.replaced}, whose role and organization were left as they were —
                                change them from the Admin dashboard if they should no longer have access.
                            </p>
                        ) : null}
                        <p className="text-xs text-ink-400">
                            They pick this up the next time their profile is read; an open session keeps its current
                            role until it reloads.
                        </p>
                        <div className="flex justify-end pt-1">
                            <Button onClick={() => setAssignOrg(null)}>Done</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-ink-500">Account email</label>
                            <input
                                className="input w-full"
                                type="email"
                                value={assignEmail}
                                onChange={(e) => setAssignEmail(e.target.value)}
                                placeholder="person@example.com"
                            />
                            <p className="text-xs text-ink-400">
                                The account must already exist. Sets its role to HR administrator and attaches it to
                                this organization.
                            </p>
                        </div>
                        {assignError ? <p className="text-sm text-rose-600">{assignError}</p> : null}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="secondary" onClick={() => setAssignOrg(null)}>Cancel</Button>
                            <Button
                                onClick={submitAssign}
                                disabled={!assignEmail.trim() || assigning}
                                icon={assigning ? <Loader2 size={15} className="animate-spin" /> : undefined}
                            >
                                {assigning ? 'Assigning…' : 'Assign'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                open={featuresOrg !== null}
                onClose={() => setFeaturesOrg(null)}
                title="Feature rollout"
                subtitle={`Which changes ${liveFeaturesOrg?.name ?? 'this organization'} has been given.`}
            >
                <div className="space-y-4">
                    <p className="text-sm text-ink-500">
                        The app is one deployment for every organization, so a change reaches all of
                        them the moment it ships. These decide who it is <em>on</em> for. They gate
                        behaviour only — never who may read or write anything, which stays with the
                        security rules and is the same for every tenant.
                    </p>

                    {featureError ? (
                        <p className="text-sm text-red-600">{featureError}</p>
                    ) : null}

                    <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                        {FLAG_LIST.map((flag) => {
                            const enabled = liveFeaturesOrg?.features?.[flag.key] ?? flag.defaultValue;
                            return (
                                <div key={flag.key} className="flex items-start justify-between gap-4 px-4 py-3">
                                    <div>
                                        <p className="text-sm font-medium text-ink-900">{flag.key}</p>
                                        <p className="text-xs text-ink-500">{flag.description}</p>
                                    </div>
                                    <Button
                                        variant={enabled ? 'primary' : 'secondary'}
                                        size="sm"
                                        disabled={featureSaving === flag.key}
                                        onClick={() => liveFeaturesOrg && toggleFeature(liveFeaturesOrg, flag.key, !enabled)}
                                    >
                                        {featureSaving === flag.key ? '…' : enabled ? 'On' : 'Off'}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-xs text-ink-400">
                        Takes effect for that organization&rsquo;s signed-in users without a redeploy —
                        each session is subscribed to its own organization record.
                    </p>

                    <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => setFeaturesOrg(null)}>Done</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
