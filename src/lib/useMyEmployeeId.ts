/**
 * Which employee record the signed-in account *is*, as the server sees it.
 *
 * There are two answers to that question in this codebase and only one of them
 * counts. `getCurrentEmployeeRecord` (src/lib/dataScope.ts) matches the account
 * against the employee directory, which lives in localStorage and is therefore
 * a claim the client makes about itself — fine for scoping what to render,
 * worthless as a permission input. `employee_links/{uid}` is an
 * administrator-authored document, and it is what `myEmployeeId()` in
 * firestore.rules resolves against.
 *
 * So anything whose *server* answer depends on identity — may I advance this
 * candidate, is this my job opening — has to ask this one, or the UI offers
 * controls the rules will refuse and the refusal arrives as a console error
 * with no explanation attached. See docs/salary-leave-access-spec.md §3.
 *
 * Resolves to `null` for an account with no link, which is the same fail-closed
 * answer the rules give. Callers must say so rather than simply hiding the
 * control: "you are not the hiring manager" and "nobody has told this app who
 * you are" look identical otherwise, and only one of them is fixable by the
 * person looking at the screen.
 */
import { useEffect, useState } from 'react';
import { getEmployeeLink } from '@/data/employeeLinks';
import type { UserProfile } from '@/lib/auth';

export interface MyEmployeeId {
  /** The linked employee record's id, or null when the account has no link. */
  employeeId: string | null;
  /** False until the lookup has finished — distinct from "resolved to null". */
  resolved: boolean;
}

export function useMyEmployeeId(profile: UserProfile | null): MyEmployeeId {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const uid = profile?.uid ?? '';

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setEmployeeId(null);
      setResolved(true);
      return;
    }
    setResolved(false);
    getEmployeeLink(uid).then((link) => {
      if (cancelled) return;
      setEmployeeId(link?.employeeId ?? null);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { employeeId, resolved };
}
