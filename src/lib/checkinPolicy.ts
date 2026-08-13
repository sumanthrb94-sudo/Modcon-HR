import { getAuth } from 'firebase/auth'

/**
 * The organisation's progress check-in policy.
 *
 * It lives in the check-in subsystem's Postgres, not in Firestore, so this is
 * the one part of Settings that does not go through `orgSettings`. It is
 * reached over HTTP with the Firebase token the user already holds — see
 * docs/checkin-policy-spec.md for why the alternative (mirroring it into
 * ORG_SETTINGS and syncing) was rejected: the dispatcher would keep acting on
 * the old cadence until a sync ran, with nothing on screen to say so.
 */
export interface CheckinPolicy {
  cadence_days: number
  channel_ladder: string[]
  escalate_after_days: number
  quiet_start: number
  quiet_end: number
  timezone: string
}

/**
 * The subsystem is a separate deployment, so its address is configuration.
 * Absent — which is every deployment today — the section says check-ins are
 * not configured rather than failing on every render.
 */
export const checkinApiBase: string = import.meta.env.VITE_CHECKIN_FUNCTIONS_URL ?? ''

export const checkinPolicyConfigured = checkinApiBase !== ''

async function authorizedFetch(init: RequestInit = {}): Promise<Response> {
  const user = getAuth().currentUser
  if (!user) throw new Error('Sign in again to change check-in settings.')

  // A fresh token per request rather than a cached one: getIdToken refreshes
  // when it is close to expiring, and the function rejects an expired token.
  const token = await user.getIdToken()

  return fetch(`${checkinApiBase}/checkin-policy`, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  })
}

/** null means this organisation has configured nothing, and nobody is being asked. */
export async function getCheckinPolicy(): Promise<CheckinPolicy | null> {
  const res = await authorizedFetch()
  if (res.status === 403) {
    throw new Error('Only an administrator of this organisation can change check-ins.')
  }
  if (res.status === 503) {
    throw new Error('Check-in settings are temporarily unavailable. Nothing has changed.')
  }
  if (!res.ok) throw new Error('Could not load the check-in policy.')

  const body = (await res.json()) as { policy: CheckinPolicy | null }
  return body.policy
}

export async function saveCheckinPolicy(policy: CheckinPolicy): Promise<void> {
  const res = await authorizedFetch({ method: 'PUT', body: JSON.stringify(policy) })
  if (!res.ok) {
    // The validator's messages are written to be read by a person, so they are
    // shown as they are rather than replaced with something vaguer.
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save the check-in policy.')
  }
}
