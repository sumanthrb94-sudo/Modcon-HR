/**
 * Comp-off credits as the organisation records them — see data/compOffRules.ts
 * for what earns one and why nobody is credited automatically.
 *
 * Read by the person and the reporting line above them, decided by a manager
 * above them or HR, never by the person (firestore.rules,
 * performanceWriteIsAuthorised).
 */
import { persistentCollection } from '@/data/persistence';
import { COMP_OFF_VALID_DAYS, addDays, compOffId, type CompOffCredit } from '@/data/compOffRules';

const store = persistentCollection<CompOffCredit>(
  'modcon.hr.compOffCredits',
  'modcon-hr-comp-off-changed',
  () => [],
  'compOffCredits',
  'self',
);

export const COMP_OFF_CHANGED_EVENT = store.changedEvent;
export const getCompOffCredits = () => store.get();

export function decideCompOff(
  candidate: { employeeId: string; date: string; days: number },
  status: 'Approved' | 'Rejected',
  decidedBy: string,
  today: string,
): CompOffCredit[] {
  const credit: CompOffCredit = {
    id: compOffId(candidate.employeeId, candidate.date),
    employeeId: candidate.employeeId,
    date: candidate.date,
    days: candidate.days,
    status,
    decidedBy,
    decidedOn: today,
    expiresOn: addDays(candidate.date, COMP_OFF_VALID_DAYS),
  };
  return store.save([...store.get().filter((c) => c.id !== credit.id), credit]);
}
