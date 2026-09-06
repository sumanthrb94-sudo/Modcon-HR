import type { ActionCodeSettings } from 'firebase/auth';

/**
 * Where a password link sends somebody back to.
 *
 * ## What is in code here and what is not
 *
 * Firebase Auth sends these emails, not this app — there is no backend to send
 * one from, and that is the whole reason the invite flow uses Firebase's own
 * mail rather than inventing a delivery mechanism. The consequence is that the
 * *sender name*, the *from address*, the subject and the body are project
 * configuration (Firebase Console → Authentication → Templates, or the
 * Identity Platform admin API), not something this repository can set. Writing
 * a "sender name" constant here would be a value nothing reads that looks like
 * a decision somebody made.
 *
 * What the client does control is the **continue URL**: where the person lands
 * once the link has done its job. Without one they finish on Firebase's own
 * generic "your password has been changed" page, on a `firebaseapp.com`
 * domain, with no way back to the product they were being invited to. With one
 * they land on this app's sign-in screen, which is where they were going.
 *
 * ## The domain has to be authorised
 *
 * Firebase refuses a continue URL whose domain is not on the project's
 * authorized-domains list (`auth/unauthorized-continue-uri`), so this is
 * derived from wherever the app is actually being served rather than hardcoded
 * — a preview deployment, localhost and production each name themselves. The
 * production domain must be added once in Firebase Console → Authentication →
 * Settings → Authorized domains; `localhost` is there by default.
 *
 * Every caller treats a failure here as non-fatal: the account exists either
 * way, and refusing to send a link because a continue URL was rejected would
 * be worse than sending one that lands on Firebase's own page.
 */
export function passwordActionSettings(): ActionCodeSettings | undefined {
  if (typeof window === 'undefined') return undefined;
  return {
    url: `${window.location.origin}/login`,
    // False on purpose: the link is handled by Firebase's hosted page, which
    // takes the new password and then forwards to `url`. Handling it in-app
    // would mean building a set-password screen that re-implements the code
    // verification, for no gain — and it would have to exist before the first
    // invite could be sent.
    handleCodeInApp: false,
  };
}

/**
 * Send a password link, and do not let the continue URL be why it fails.
 *
 * `passwordActionSettings()` names the domain the app is served from, and
 * Firebase rejects one that is not on the project's authorized-domains list
 * with `auth/unauthorized-continue-uri`. That list is a console setting nobody
 * has necessarily touched — a new Vercel preview URL, a custom domain added
 * last week — and the failure would land on the one path where it does real
 * damage: the sign-in page's *forgot password*, which sent these mails
 * perfectly well before the continue URL existed. An employee locked out of
 * their own account because a redirect target was unregistered is a worse
 * outcome than one who finishes on Firebase's own confirmation page.
 *
 * So the continue URL is an improvement that degrades: rejected, it is dropped
 * and the mail is sent without it. Every other error propagates — a wrong
 * address or a rate limit is the caller's to report.
 */
export async function sendPasswordLink(
  send: (settings?: ActionCodeSettings) => Promise<void>,
): Promise<void> {
  try {
    await send(passwordActionSettings());
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code !== 'auth/unauthorized-continue-uri' && code !== 'auth/invalid-continue-uri') throw err;
    await send(undefined);
  }
}
