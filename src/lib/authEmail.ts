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
