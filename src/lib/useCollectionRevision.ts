import { useEffect, useState } from 'react';

/**
 * Bumps whenever a persistent collection changes, here or in another tab.
 *
 * The per-store hooks (useHolidayDirectoryRevision and friends) are all this
 * function with the event name baked in; new collections use it directly
 * rather than adding another near-identical file.
 */
export function useCollectionRevision(changedEvent: string): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((current) => current + 1);
    window.addEventListener(changedEvent, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(changedEvent, bump);
      window.removeEventListener('storage', bump);
    };
  }, [changedEvent]);

  return revision;
}
