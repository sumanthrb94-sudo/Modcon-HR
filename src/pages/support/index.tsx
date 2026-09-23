import { MessageSquarePlus, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge, Button, Card, Modal, PageHeader } from '@/components/ui';
import { getCompanyProfile } from '@/data/companyProfile';
import { useAuth } from '@/lib/auth';
import {
    openSupportThread,
    replySupportThread,
    setSupportThreadStatus,
    subscribeSupportMessages,
    subscribeSupportThreads,
    SUPPORT_SUBJECT_MAX,
    SUPPORT_TEXT_MAX,
    type SupportMessage,
    type SupportSide,
    type SupportThread,
} from '@/lib/supportChat';

function when(date: Date | null): string {
    return date ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'just now';
}

/**
 * Support — an organisation's HR and the platform, in one conversation list.
 *
 * Two audiences on one page, decided by who is looking. An HR Manager or
 * Administrator sees their organisation's conversations and can open a new
 * one. The Super Admin sees every organisation's, as an inbox, and answers.
 * Managers and Employees never reach it (RequireOrgAdmin): their questions go
 * to their own HR through Helpdesk. The server enforces the same split.
 */
export function SupportPage() {
    const { profile, isSuperAdmin } = useAuth();
    const orgId = profile?.orgId ?? null;
    const side: SupportSide = isSuperAdmin ? 'platform' : 'org';

    const [threads, setThreads] = useState<SupportThread[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [newOpen, setNewOpen] = useState(false);

    useEffect(() => {
        if (isSuperAdmin) {
            return subscribeSupportThreads({ superAdmin: true }, setThreads, setLoadError);
        }
        if (!orgId) return;
        return subscribeSupportThreads({ superAdmin: false, orgId }, setThreads, setLoadError);
    }, [isSuperAdmin, orgId]);

    const selected = useMemo(
        () => threads?.find((t) => t.id === selectedId) ?? null,
        [threads, selectedId],
    );
    const openCount = threads?.filter((t) => t.status === 'open').length ?? 0;

    if (!isSuperAdmin && !orgId) {
        return (
            <div className="space-y-6">
                <PageHeader title="Support" />
                <Card><p className="text-sm text-ink-600">Your account belongs to no organisation, so there is nobody to open a conversation for.</p></Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={isSuperAdmin ? 'Support inbox' : 'Support'}
                subtitle={isSuperAdmin
                    ? `Conversations from every organisation's HR · ${openCount} open`
                    : 'Talk to the ModCon HR platform team — account access, billing, anything the app cannot do for you'}
                actions={!isSuperAdmin ? (
                    <Button icon={<MessageSquarePlus size={16} />} onClick={() => setNewOpen(true)}>
                        New conversation
                    </Button>
                ) : undefined}
            />

            {!isSuperAdmin && (
                <p className="text-sm text-ink-600 max-w-3xl">
                    The platform team can reset an administrator&rsquo;s password and manage your subscription. They cannot
                    see or change your employees&rsquo; records — by design, those stay your organisation&rsquo;s — so
                    describe what you need rather than expecting them to look it up.
                </p>
            )}

            {loadError && <div role="alert" className="border-2 border-brand-600 bg-brand-50 px-4 py-3 text-sm text-ink-900">{loadError}</div>}

            {/* grid-cols-1 below lg: a bare grid track sizes to its widest
                content, and an unwrapped subject or date pushed the inbox to
                475px on a 390px phone. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                <Card padding={false} className="min-w-0">
                    <h2 className="px-4 pt-4 pb-2 text-base font-semibold text-ink-900">Conversations</h2>
                    {threads === null ? (
                        <p className="px-4 pb-4 text-sm text-ink-500">Loading…</p>
                    ) : threads.length === 0 ? (
                        <p className="px-4 pb-4 text-sm text-ink-500">
                            {isSuperAdmin ? 'No organisation has written in yet.' : 'No conversations yet. Start one with “New conversation”.'}
                        </p>
                    ) : (
                        <ul className="divide-y divide-ink-100" data-testid="support-threads">
                            {threads.map((t) => (
                                <li key={t.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(t.id)}
                                        className={`w-full text-left px-4 py-3 hover:bg-ink-50 ${selectedId === t.id ? 'bg-brand-50' : ''}`}
                                        aria-current={selectedId === t.id ? 'true' : undefined}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="min-w-0 text-sm font-medium text-ink-900 truncate">{t.subject}</span>
                                            <Badge className="shrink-0" tone={t.status === 'open' ? 'amber' : 'green'}>{t.status === 'open' ? 'Open' : 'Resolved'}</Badge>
                                        </div>
                                        <p className="mt-0.5 text-xs text-ink-500 break-words">
                                            {isSuperAdmin ? `${t.orgName ?? t.orgId} · ` : ''}
                                            {t.lastMessageBy === 'platform' ? 'Platform replied' : 'Waiting on the platform'} · {when(t.lastMessageAt)}
                                        </p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                {selected ? (
                    <Conversation key={selected.id} thread={selected} side={side} showOrg={isSuperAdmin} />
                ) : (
                    <Card className="min-w-0"><p className="text-sm text-ink-500">Choose a conversation to read it.</p></Card>
                )}
            </div>

            {!isSuperAdmin && orgId && (
                <NewConversationModal
                    open={newOpen}
                    onClose={() => setNewOpen(false)}
                    orgId={orgId}
                    onOpened={(id) => { setNewOpen(false); setSelectedId(id); }}
                />
            )}
        </div>
    );
}

function Conversation({ thread, side, showOrg }: { thread: SupportThread; side: SupportSide; showOrg: boolean }) {
    const [messages, setMessages] = useState<SupportMessage[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => subscribeSupportMessages(thread.id, setMessages, setError), [thread.id]);

    async function send() {
        setBusy(true);
        setError(null);
        try {
            await replySupportThread(thread.id, side, draft);
            setDraft('');
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'That message was not sent.');
        } finally {
            setBusy(false);
        }
    }

    async function toggleStatus() {
        setError(null);
        try {
            await setSupportThreadStatus(thread.id, thread.status === 'open' ? 'resolved' : 'open', side);
        } catch {
            setError('That change was not saved.');
        }
    }

    return (
        <Card className="min-w-0">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-ink-900">{thread.subject}</h2>
                    <p className="text-xs text-ink-500 break-words">
                        {showOrg ? `${thread.orgName ?? thread.orgId} · ` : ''}Opened by {thread.createdByEmail ?? 'the organisation'} · {when(thread.createdAt)}
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={toggleStatus}>
                    {thread.status === 'open' ? 'Mark resolved' : 'Reopen'}
                </Button>
            </div>

            <ol className="space-y-3 max-h-[28rem] overflow-y-auto pr-1" data-testid="support-messages" aria-live="polite">
                {messages === null ? (
                    <li className="text-sm text-ink-500">Loading…</li>
                ) : messages.map((m) => (
                    <li key={m.id} className={`border px-3 py-2 ${m.authorSide === side ? 'border-ink-200 bg-ink-50 ml-8' : 'border-brand-200 bg-white mr-8'}`}>
                        <p className="text-xs font-semibold text-ink-700">
                            {m.authorSide === 'platform' ? 'ModCon HR platform team' : (m.authorEmail ?? 'Organisation')}
                            <span className="font-normal text-ink-500"> · {when(m.at)}</span>
                        </p>
                        <p className="mt-1 text-sm text-ink-900 whitespace-pre-wrap break-words">{m.text}</p>
                    </li>
                ))}
            </ol>

            {error && <p role="alert" className="mt-3 text-sm text-brand-700">{error}</p>}

            <div className="mt-4 space-y-2">
                <label htmlFor="support-reply" className="text-sm font-medium text-ink-700">Reply</label>
                <textarea
                    id="support-reply"
                    className="input w-full min-h-24"
                    maxLength={SUPPORT_TEXT_MAX}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={side === 'platform' ? 'Answer the organisation…' : 'Write to the platform team…'}
                />
                <Button icon={<Send size={14} />} onClick={send} disabled={busy || !draft.trim()}>
                    {busy ? 'Sending…' : 'Send'}
                </Button>
            </div>
        </Card>
    );
}

function NewConversationModal({ open, onClose, orgId, onOpened }: {
    open: boolean;
    onClose: () => void;
    orgId: string;
    onOpened: (id: string) => void;
}) {
    const [subject, setSubject] = useState('');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            const id = await openSupportThread({ orgId, orgName: getCompanyProfile().name || undefined, subject, text });
            setSubject('');
            setText('');
            onOpened(id);
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'That conversation was not opened.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="New conversation"
            subtitle="The platform team will reply here."
            footer={(
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={busy || !subject.trim() || !text.trim()}>
                        {busy ? 'Sending…' : 'Send to platform'}
                    </Button>
                </>
            )}
        >
            <div className="space-y-4">
                <div>
                    <label htmlFor="support-subject" className="text-sm font-medium text-ink-700 block mb-1">Subject</label>
                    <input id="support-subject" className="input w-full" maxLength={SUPPORT_SUBJECT_MAX} value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div>
                    <label htmlFor="support-first-message" className="text-sm font-medium text-ink-700 block mb-1">Message</label>
                    <textarea id="support-first-message" className="input w-full min-h-32" maxLength={SUPPORT_TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
                </div>
                {error && <p role="alert" className="text-sm text-brand-700">{error}</p>}
            </div>
        </Modal>
    );
}
