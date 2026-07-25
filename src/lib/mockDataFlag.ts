const MOCK_DATA_CLEARED_KEY = 'modcon.hr.mockDataCleared';

/**
 * When set, the built-in seed employee roster (src/data/employees.ts) is
 * excluded from the directory — only locally-added employees remain.
 * Checked once at module-load time by getEmployeeDirectory, so toggling it
 * only takes effect after a page reload.
 */
export function isMockDataCleared(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MOCK_DATA_CLEARED_KEY) === '1';
}

export function setMockDataCleared(cleared: boolean) {
  if (typeof window === 'undefined') return;
  if (cleared) {
    window.localStorage.setItem(MOCK_DATA_CLEARED_KEY, '1');
  } else {
    window.localStorage.removeItem(MOCK_DATA_CLEARED_KEY);
  }
}
