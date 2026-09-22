import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  ORG_RECORDS_WRITE_FAILED_EVENT,
  type OrgRecordsWriteFailedDetail,
} from '@/data/persistence';

/**
 * Says so when a change the screen was already showing was refused.
 *
 * Writes to `org_records` are optimistic: `save()` writes the cache, fires its
 * change event and returns, and the commit follows without being awaited. When
 * that commit failed, the only trace was a `console.warn` — so a rejected
 * approval sat on screen looking exactly like one that had landed, and
 * survived a reload. QA filed it as R4-M1; the PRD made it gate G7, phrased as
 * "the UI can never show saved/approved for data the database rejected".
 *
 * `persistence.ts` rolls the cache back. This is the other half: without it
 * the row silently reverts a moment after the click, which reads as the app
 * losing the change rather than the server refusing it — and leaves somebody
 * clicking Approve over and over.
 *
 * In the layout rather than on a page because the refusal can come from any
 * store, and the person is standing wherever they were. It renders nothing
 * until something fails, which is almost always.
 *
 * Dismissable, and it does not auto-dismiss: a decision that did not stick is
 * worth reading at your own pace, and a toast that vanishes after three
 * seconds is how people end up believing the change went through.
 */
export function SaveFailureBanner() {
  const [failure, setFailure] = useState<OrgRecordsWriteFailedDetail | null>(null);

  useEffect(() => {
    function onFailure(event: Event) {
      const detail = (event as CustomEvent<OrgRecordsWriteFailedDetail>).detail;
      if (detail) setFailure(detail);
    }
    window.addEventListener(ORG_RECORDS_WRITE_FAILED_EVENT, onFailure);
    return () => window.removeEventListener(ORG_RECORDS_WRITE_FAILED_EVENT, onFailure);
  }, []);

  if (!failure) return null;

  return (
    <div
      role="alert"
      data-testid="save-failure-banner"
      className="flex items-start gap-3 border-b-2 border-brand-600 bg-brand-50 px-4 py-3 lg:px-6"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-brand-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">Your change was not saved</p>
        <p className="mt-0.5 text-sm text-ink-700">{failure.message}</p>
      </div>
      <button
        type="button"
        onClick={() => setFailure(null)}
        aria-label="Dismiss"
        className="shrink-0 p-1 text-ink-500 hover:text-ink-900"
      >
        <X size={16} />
      </button>
    </div>
  );
}
