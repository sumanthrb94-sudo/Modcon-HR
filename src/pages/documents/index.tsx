import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Upload, History, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  type Column,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  canPublishHandbook,
  publishExistingVersion,
  publishHandbookVersion,
  useHandbook,
  HANDBOOK_NOTES_MAX,
} from '@/lib/handbook';
import {
  formatBytes,
  HANDBOOK_MAX_BYTES,
  HandbookUploadError,
  toBlobUrl,
} from '@/lib/handbookStorage';
import type { HandbookVersion } from '@/types';
import { formatDate } from '@/lib/utils';

/**
 * Employee handbook.
 *
 * Every signed-in user reads the current version and the history; only an
 * organisation's administrators (HR and Admin) see the upload panel. That split
 * is presentation — the enforcement is the `isOrgAdmin()` check on
 * `handbook_versions` and `handbook` in firestore.rules, and a user who forges
 * their local role gets the panel and then a permission error on submit.
 */
export function DocumentsPage() {
  const { profile } = useAuth();
  const { versions, current, unpublished, loading, error } = useHandbook(profile);
  const canPublish = canPublishHandbook(profile);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Company policy documents available to everyone in the organisation."
      />

      {error ? (
        <Card>
          <div className="p-6 flex items-start gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-ink-900">Could not load the handbook</p>
              <p className="mt-1 text-sm text-ink-500">{error.message}</p>
              <p className="mt-2 text-xs text-ink-400">
                If this says insufficient permissions, the handbook security rules have not been
                deployed yet — they ship separately from the app with{' '}
                <code>firebase deploy --only firestore:rules</code>.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Suppressed when the load failed: "no handbook has been published"
          asserts something we do not know when the read was denied. */}
      {error ? null : (
        <CurrentHandbook current={current} loading={loading} canPublish={canPublish} />
      )}

      {canPublish ? (
        <UploadPanel versions={versions} unpublished={unpublished} />
      ) : null}

      {versions.length > 0 ? (
        <VersionHistory versions={versions} currentId={current?.id ?? null} canPublish={canPublish} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Current version
// ---------------------------------------------------------------------------

function CurrentHandbook({
  current,
  loading,
  canPublish,
}: {
  current: HandbookVersion | null;
  loading: boolean;
  canPublish: boolean;
}) {
  const url = useObjectUrl(current?.contentBase64 ?? null);

  if (loading) {
    return (
      <Card>
        <div className="p-6 text-sm text-ink-500">Loading the handbook…</div>
      </Card>
    );
  }

  if (!current) {
    return (
      <Card>
        <div className="p-6">
          <EmptyState
            icon={<BookOpen size={26} />}
            title="No handbook has been published yet"
            description={
              canPublish
                ? 'Upload a PDF below to publish the first version. Everyone in the organisation will be able to read it.'
                : 'Once HR publishes the employee handbook it will appear here.'
            }
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Employee Handbook"
        subtitle={`Version ${current.version} · published ${formatDate(current.uploadedAt)} by ${current.uploadedByName}`}
        action={
          url ? (
            <a href={url} download={current.fileName}>
              <Button variant="secondary" icon={<Download size={16} className="mr-2" />}>
                Download
              </Button>
            </a>
          ) : null
        }
      />
      <div className="px-6 pb-6 space-y-4">
        {current.notes ? (
          <p className="text-sm text-ink-600">
            <span className="font-medium text-ink-800">What changed:</span> {current.notes}
          </p>
        ) : null}
        <p className="text-xs text-ink-400">
          {current.fileName} · {formatBytes(current.sizeBytes)}
        </p>
        {url ? (
          <iframe
            title="Employee handbook"
            src={url}
            className="w-full h-[70vh] rounded-lg border border-ink-200 bg-ink-50"
          />
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Upload (organisation administrators only)
// ---------------------------------------------------------------------------

function UploadPanel({
  versions,
  unpublished,
}: {
  versions: HandbookVersion[];
  unpublished: HandbookVersion[];
}) {
  const { profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const nextVersion = versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

  async function handlePublish() {
    // Re-checked here as well as at render: the panel is hidden for anyone who
    // isn't HR, but a hidden control is not a closed one.
    if (!canPublishHandbook(profile) || !file || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await publishHandbookVersion(profile, file, notes, versions);
      if (result.pointerFailed) {
        setMessage({
          tone: 'warn',
          text: `Version ${result.version} was uploaded but could not be published. It is listed below — use Publish to try again without re-uploading.`,
        });
      } else {
        setMessage({ tone: 'ok', text: `Version ${result.version} is now the current handbook.` });
      }
      setFile(null);
      setNotes('');
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      setMessage({
        tone: 'error',
        text:
          err instanceof HandbookUploadError
            ? err.message
            : // The rules deny the write for anyone who isn't HR on the server,
              // whatever the client believes about its own role.
              'Upload failed. You may not have permission to publish the handbook.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Publish a new version"
        subtitle="HR and administrators. The previous version stays in the history — publishing never overwrites it."
      />
      <div className="px-6 pb-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1" htmlFor="handbook-file">
              Handbook PDF
            </label>
            <input
              id="handbook-file"
              ref={fileInput}
              type="file"
              accept="application/pdf"
              className="input"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setMessage(null);
              }}
            />
            <p className="mt-1 text-xs text-ink-400">
              PDF, up to {formatBytes(HANDBOOK_MAX_BYTES)}.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1" htmlFor="handbook-notes">
              What changed <span className="text-ink-400">(optional)</span>
            </label>
            <input
              id="handbook-notes"
              type="text"
              className="input"
              maxLength={HANDBOOK_NOTES_MAX}
              placeholder="e.g. Updated leave policy"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {message ? (
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              message.tone === 'ok'
                ? 'bg-emerald-50 text-emerald-800'
                : message.tone === 'warn'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-rose-50 text-rose-800'
            }`}
          >
            {message.tone === 'ok' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            )}
            <span data-testid="handbook-upload-message">{message.text}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            onClick={handlePublish}
            disabled={!file || busy}
            icon={<Upload size={16} className="mr-2" />}
            data-testid="handbook-publish"
          >
            {busy ? 'Publishing…' : `Publish as v${nextVersion}`}
          </Button>
          {unpublished.length > 0 ? (
            <span className="text-xs text-ink-400">
              {unpublished.length} earlier {unpublished.length === 1 ? 'version is' : 'versions are'} not
              current.
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function VersionHistory({
  versions,
  currentId,
  canPublish,
}: {
  versions: HandbookVersion[];
  currentId: string | null;
  canPublish: boolean;
}) {
  const { profile } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  const columns: Column<HandbookVersion>[] = useMemo(() => {
    const base: Column<HandbookVersion>[] = [
      {
        key: 'version',
        header: 'Version',
        render: (v) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink-900">v{v.version}</span>
            {v.id === currentId ? <Badge tone="green">Current</Badge> : null}
          </div>
        ),
      },
      { key: 'uploadedAt', header: 'Published', render: (v) => formatDate(v.uploadedAt) },
      { key: 'uploadedByName', header: 'By', render: (v) => v.uploadedByName },
      {
        key: 'notes',
        header: 'What changed',
        render: (v) => <span className="text-ink-500">{v.notes || '—'}</span>,
      },
      {
        key: 'sizeBytes',
        header: 'File',
        render: (v) => (
          <span className="text-ink-500">
            {v.fileName} · {formatBytes(v.sizeBytes)}
          </span>
        ),
      },
      {
        key: 'id',
        header: '',
        render: (v) => <DownloadLink version={v} />,
      },
    ];

    if (!canPublish) return base;

    return [
      ...base,
      {
        key: 'orgId',
        header: '',
        render: (v) =>
          v.id === currentId ? null : (
            <Button
              variant="ghost"
              disabled={busyId === v.id}
              onClick={async () => {
                setBusyId(v.id);
                try {
                  await publishExistingVersion(profile, v);
                } finally {
                  setBusyId(null);
                }
              }}
            >
              {busyId === v.id ? 'Publishing…' : 'Publish'}
            </Button>
          ),
      },
    ];
  }, [currentId, canPublish, busyId, profile]);

  return (
    <Card>
      <CardHeader
        title="Version history"
        subtitle="Every published version is kept. Reverting republishes an earlier one rather than deleting the newer."
        action={<History size={18} className="text-ink-400" />}
      />
      <Table data={versions} columns={columns} keyExtractor={(v) => v.id} />
    </Card>
  );
}

function DownloadLink({ version }: { version: HandbookVersion }) {
  const url = useObjectUrl(version.contentBase64);
  if (!url) return null;
  return (
    <a href={url} download={version.fileName} className="text-brand-600 hover:underline text-sm">
      Download
    </a>
  );
}

// ---------------------------------------------------------------------------
// Object URLs
// ---------------------------------------------------------------------------

/**
 * A Blob URL for base64 content, revoked when the content changes or the
 * component unmounts — without the revoke, every re-render of the history table
 * would strand another copy of the PDF in memory for the life of the tab.
 */
function useObjectUrl(contentBase64: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!contentBase64) {
      setUrl(null);
      return;
    }
    const next = toBlobUrl(contentBase64);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [contentBase64]);

  return url;
}
