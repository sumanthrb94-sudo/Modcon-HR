import type { LeavePolicy } from '@/data/leavePolicies';

/**
 * Starting points for an organisation's leave policy, offered by the guided
 * setup.
 *
 * ## A template is a choice, not a default
 *
 * This app deliberately ships no leave policy: one handed out unasked reads as
 * the company's own, is offered in Apply Leave, and is what loss of pay comes
 * off (see `getLeavePolicies`). A template does not change that. Nothing here
 * is applied until an administrator has read the figures and pressed the
 * button, and "set it up myself" is offered beside them — so what is saved is a
 * decision somebody at the company made, which is the whole requirement. Every
 * figure stays editable in Settings → Leave Policies afterwards.
 *
 * ## Not the demo policy
 *
 * The ids are `lp-tpl-*`. `inheritedDemoPolicies` identifies ModCon Builders'
 * seeded policy by its literal `lp1`..`lp7` ids, and a template sharing those
 * would be reported to the organisation as borrowed demo data.
 *
 * Pure, so `npm run test:unit` covers it.
 */

export interface LeavePolicyTemplate {
  id: string;
  name: string;
  /** Who it tends to suit, in a sentence. Not a recommendation. */
  summary: string;
  policies: LeavePolicy[];
}

function policy(
  slug: string,
  fields: Omit<LeavePolicy, 'id' | 'annual'> & { annual?: number },
): LeavePolicy {
  return {
    id: `lp-tpl-${slug}`,
    ...fields,
    // A monthly policy's yearly figure is derived, never typed — the same
    // invariant `normalizePolicy` keeps.
    annual: fields.accrual === 'monthly' ? fields.monthlyAccrual * 12 : fields.annual ?? 0,
  };
}

const unpaid = policy('unpaid', {
  type: 'Unpaid Leave',
  accrual: 'annual',
  monthlyAccrual: 0,
  carryForward: false,
  carryForwardBeyondYear: false,
  encashment: false,
  halfDay: false,
  minTenureMonths: 0,
  applicable: 'All employees',
});

export const LEAVE_POLICY_TEMPLATES: LeavePolicyTemplate[] = [
  {
    id: 'monthly',
    name: 'Earn as you go',
    summary:
      'Casual and sick leave build up a day a month, and earned leave starts after a year. Common in growing teams, because nobody can take a year’s leave in their first week.',
    policies: [
      policy('casual', {
        type: 'Casual Leave',
        accrual: 'monthly',
        monthlyAccrual: 1,
        carryForward: true,
        carryForwardBeyondYear: false,
        encashment: false,
        halfDay: true,
        minTenureMonths: 0,
        applicable: 'All employees',
      }),
      policy('sick', {
        type: 'Sick Leave',
        accrual: 'monthly',
        monthlyAccrual: 0.5,
        carryForward: true,
        carryForwardBeyondYear: false,
        encashment: false,
        halfDay: true,
        minTenureMonths: 0,
        applicable: 'All employees',
      }),
      policy('earned', {
        type: 'Earned Leave',
        accrual: 'annual',
        annual: 15,
        monthlyAccrual: 0,
        carryForward: true,
        carryForwardBeyondYear: true,
        encashment: true,
        halfDay: true,
        minTenureMonths: 12,
        applicable: 'Employees with over 1 year of service',
      }),
      unpaid,
    ],
  },
  {
    id: 'annual',
    name: 'Full year up front',
    summary:
      'Everybody gets the whole year’s casual, sick and earned leave on 1 April. Simple to explain; suits a settled team where people rarely leave mid-year.',
    policies: [
      policy('casual', {
        type: 'Casual Leave',
        accrual: 'annual',
        annual: 8,
        monthlyAccrual: 0,
        carryForward: false,
        carryForwardBeyondYear: false,
        encashment: false,
        halfDay: true,
        minTenureMonths: 0,
        applicable: 'All employees',
      }),
      policy('sick', {
        type: 'Sick Leave',
        accrual: 'annual',
        annual: 6,
        monthlyAccrual: 0,
        carryForward: false,
        carryForwardBeyondYear: false,
        encashment: false,
        halfDay: true,
        minTenureMonths: 0,
        applicable: 'All employees',
      }),
      policy('earned', {
        type: 'Earned Leave',
        accrual: 'annual',
        annual: 12,
        monthlyAccrual: 0,
        carryForward: true,
        carryForwardBeyondYear: true,
        encashment: true,
        halfDay: true,
        minTenureMonths: 0,
        applicable: 'All employees',
      }),
      unpaid,
    ],
  },
];

/** How a policy's grant reads in a sentence: "1 day a month", "15 days a year". */
export function describeGrant(policy: LeavePolicy): string {
  if (policy.type === 'Unpaid Leave') return 'Unpaid — deducted from pay';
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  const grant = policy.accrual === 'monthly' ? `${days(policy.monthlyAccrual)} a month` : `${days(policy.annual)} a year`;
  return policy.minTenureMonths > 0 ? `${grant}, after ${policy.minTenureMonths} months` : grant;
}
