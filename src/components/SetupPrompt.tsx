import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getOrganisationTasks, GUIDED_SETUP_TASK_IDS, guidedSetupOutstanding } from '@/data/gettingStarted';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useAccessControlRevision } from '@/lib/useAccessControlRevision';
import { useCompanyProfileRevision } from '@/lib/useCompanyProfileRevision';
import { useLeavePoliciesRevision } from '@/lib/useLeavePoliciesRevision';
import { useWeekOffRevision } from '@/lib/useWeekOffRevision';

/**
 * The dashboard's pointer to the guided setup, for an organisation's
 * administrators while the setup's four essentials are not all done.
 *
 * A strip at the top of the page rather than the checklist's overlay, which
 * once took somebody's first click and is deliberately not opened unasked
 * anywhere it could. It goes away by itself: every condition is read from the
 * same getters the features use, so finishing the work in Settings instead
 * clears it just the same.
 */
export function SetupPrompt() {
  const { isAdmin, isHR } = useAuth();
  const directoryRevision = useEmployeeDirectoryRevision();
  const settingsRevision = useAccessControlRevision();
  const companyRevision = useCompanyProfileRevision();
  const leaveRevision = useLeavePoliciesRevision();
  const weekOffRevision = useWeekOffRevision();

  const tasks = useMemo(
    () => getOrganisationTasks(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [directoryRevision, settingsRevision, companyRevision, leaveRevision, weekOffRevision],
  );

  if (!(isAdmin || isHR) || !guidedSetupOutstanding(tasks)) return null;

  const essentials = tasks.filter((task) => (GUIDED_SETUP_TASK_IDS as readonly string[]).includes(task.id));
  const done = essentials.filter((task) => task.done).length;

  return (
    <div className="mb-6 flex flex-col gap-3 border-2 border-ink-900 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900">Finish setting up your workspace</p>
        <p className="mt-0.5 text-xs text-ink-600">
          {done} of {essentials.length} essentials done — company, people, week off and leave. About five minutes.
        </p>
      </div>
      <Link to="/setup" className="btn-primary shrink-0 px-4 py-2 text-sm">
        Continue setup <ArrowRight size={14} />
      </Link>
    </div>
  );
}
