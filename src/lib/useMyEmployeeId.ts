/**
 * Which employee record the signed-in account *is*, and whether that has been
 * settled yet.
 *
 * `employee_links/{uid}` is an administrator-authored document and it is what
 * `myEmployeeId()` in firestore.rules resolves against. `getLinkedEmployeeId`
 * (data/employeeLinks.ts) reads the same thing synchronously, from a cache, and
 * is what `resolveEmployeeForAccount` uses — so the app and the server now give
 * one answer where they used to give two, the client's being a directory match
 * it made about itself.
 *
 * What this hook adds is the distinction that cache cannot make: **"linked to
 * nobody" versus "not resolved yet"** both read as null there. Anything that
 * must not offer a control on a guess asks here, because "you are not this
 * role's hiring manager" and "nobody has told this app who you are" produce the
 * same empty space and only one of them is fixable by the person reading it.
 * See docs/salary-leave-access-spec.md §3.
 *
 * Its own `getDoc` rather than the shared cache, deliberately: `resolved` has
 * to mean this lookup finished, and a cache that is merely empty cannot say
 * whether it is empty because the answer is nothing or because nothing has
 * asked yet.
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
