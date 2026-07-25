import type { Holiday } from '@/types';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { orgScopedKey } from '@/lib/orgScope';

const HOLIDAYS_STORAGE_KEY = 'modcon.hr.holidays';
export const HOLIDAYS_CHANGED_EVENT = 'modcon-hr-holidays-changed';

const defaultHolidays: Holiday[] = [
  { id: 'h1', name: 'Republic Day', date: '2026-01-26', type: 'National' },
  { id: 'h2', name: 'Holi', date: '2026-03-04', type: 'National' },
  { id: 'h3', name: 'Good Friday', date: '2026-04-03', type: 'Optional' },
  { id: 'h4', name: 'Eid al-Fitr', date: '2026-03-21', type: 'Optional' },
  { id: 'h5', name: 'Independence Day', date: '2026-08-15', type: 'National' },
  { id: 'h6', name: 'Ganesh Chaturthi', date: '2026-09-14', type: 'Regional' },
  { id: 'h7', name: 'Gandhi Jayanti', date: '2026-10-02', type: 'National' },
  { id: 'h8', name: 'Dussehra', date: '2026-10-20', type: 'Regional' },
  { id: 'h9', name: 'Diwali', date: '2026-11-08', type: 'National' },
  { id: 'h10', name: 'Christmas', date: '2026-12-25', type: 'National' },
];

function notifyHolidaysChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(HOLIDAYS_CHANGED_EVENT));
}

function readStoredHolidays(): Holiday[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(orgScopedKey(HOLIDAYS_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Holiday[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getHolidayDirectory(): Holiday[] {
  const stored = readStoredHolidays();
  if (stored) return stored;
  // A freshly-created org has no relationship to this fixed India holiday
  // calendar — it starts empty until its own admin adds holidays.
  return isMockDataCleared() ? [] : defaultHolidays;
}

export function saveHolidayDirectory(holidays: Holiday[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(HOLIDAYS_STORAGE_KEY), JSON.stringify(holidays));
  notifyHolidaysChanged();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === orgScopedKey(HOLIDAYS_STORAGE_KEY)) {
      notifyHolidaysChanged();
    }
  });
}
