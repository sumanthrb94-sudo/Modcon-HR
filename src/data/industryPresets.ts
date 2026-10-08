/**
 * Sensible starting points by industry, for the guided setup.
 *
 * ModCon HR is for teams of ten to a hundred across very different trades — a
 * real-estate brokerage open on Sundays, a builder with people on four sites,
 * a clinic on rotating rosters, an office closed on the 2nd and 4th Saturday.
 * Every setting below already exists and can be changed in Settings; a preset
 * only chooses where the setup's questions *start*, so an administrator reads
 * a likely answer instead of a blank and corrects what does not fit.
 *
 * Nothing here is applied without being shown: the setup puts these values
 * into its own form fields, and only what the administrator then saves is
 * written. Pure, and imports types only, so it is unit-tested directly.
 */
import type { WeekOffDay } from '@/types';

/** The setup's Saturday question — see `SaturdayChoice` in pages/setup. */
export type PresetSaturdays = 'worked' | 'all' | '2,4' | '1,3';

/** Optional modules by their permission-matrix names (lib/moduleSwitches.ts). */
export type PresetModule =
  | 'Recruitment'
  | 'Onboarding'
  | 'Performance'
  | 'Expenses'
  | 'Assets'
  | 'Helpdesk'
  | 'Reports & Analytics'
  | 'Documents';

export interface IndustryPreset {
  id: string;
  label: string;
  /** One line on why these defaults, shown beside the choice. */
  summary: string;
  weekOff: WeekOffDay;
  saturdays: PresetSaturdays;
  /** A `LEAVE_POLICY_TEMPLATES` id. */
  leaveTemplateId: 'monthly' | 'annual';
  modules: PresetModule[];
  /** Something about attendance in this trade worth saying at setup. */
  attendanceTip: string;
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    id: 'office',
    label: 'Office / IT / services',
    summary: 'Desk teams working Monday to Friday, some Saturdays off.',
    weekOff: 'Sunday',
    saturdays: '2,4',
    leaveTemplateId: 'monthly',
    modules: ['Documents', 'Assets'],
    attendanceTip: 'Draw a check-in zone around the office in Settings → Attendance Locations.',
  },
  {
    id: 'real-estate',
    label: 'Real estate & sales',
    summary: 'Open at weekends for site visits, so the day off is a weekday.',
    weekOff: 'Tuesday',
    saturdays: 'worked',
    leaveTemplateId: 'monthly',
    modules: ['Expenses'],
    attendanceTip: 'Sales staff out on site visits can be exempted from the office check-in zone, so they check in from wherever they are.',
  },
  {
    id: 'construction',
    label: 'Construction & projects',
    summary: 'People spread over several sites, working six days a week.',
    weekOff: 'Sunday',
    saturdays: 'worked',
    leaveTemplateId: 'monthly',
    modules: ['Expenses', 'Assets'],
    attendanceTip: 'Add each site as a check-in zone, and let HR mark the day for anyone without a smartphone.',
  },
  {
    id: 'retail-health',
    label: 'Retail, clinics & hospitality',
    summary: 'Open every day on shifts, so each person gets their own days off.',
    weekOff: 'Sunday',
    saturdays: 'worked',
    leaveTemplateId: 'monthly',
    modules: [],
    attendanceTip: 'Set each person’s weekly day off on their profile, or upload a roster of days off in Settings → Week Off.',
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing & workshops',
    summary: 'Shift work on the floor, six days a week.',
    weekOff: 'Sunday',
    saturdays: 'worked',
    leaveTemplateId: 'annual',
    modules: ['Assets'],
    attendanceTip: 'Set up your shifts in Settings → Shifts so late arrivals and short days are judged against the right hours.',
  },
  {
    id: 'other',
    label: 'Something else',
    summary: 'A plain starting point: Sunday off, nothing extra switched on.',
    weekOff: 'Sunday',
    saturdays: 'worked',
    leaveTemplateId: 'monthly',
    modules: [],
    attendanceTip: 'Everything here can be changed later in Settings.',
  },
];

export function findIndustryPreset(idOrLabel: string | null | undefined): IndustryPreset | undefined {
  if (!idOrLabel) return undefined;
  return INDUSTRY_PRESETS.find((preset) => preset.id === idOrLabel || preset.label === idOrLabel);
}
