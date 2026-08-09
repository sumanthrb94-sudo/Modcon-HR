/**
 * The two subscription writes a human makes, both super-admin only.
 *
 * Everything else on a subscription is written by the Razorpay webhook running
 * with admin credentials (see docs/billing-razorpay.md). These are the
 * exceptions, and they exist because the decision not to charge an organisation
 * is a commercial one that no payment provider can make for us:
 *
 *   grantPromotion   this organisation is not charged — a pilot, a partner, or
 *                    our own. No price, no period, no renewal.
 *   endPromotion     put it back on the ordinary plan.
 *
 * `firestore.rules` already permits exactly this and nothing more: only a super
 * admin may write `/subscriptions/{orgId}`. An organisation cannot grant itself
 * a promotion any more than it can mark itself paid — they are the same write,
 * and it is refused for the same reason.
 *
 * **The webhook must not overwrite a promotion.** A promotional organisation has
 * no Razorpay subscription, so in practice no event arrives for it; the handler
 * should still skip any record already in this state rather than "correcting"
 * it to `none` on the first stray event.
 */
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { PLAN_PRICE_PAISE, type Subscription } from '@/data/subscription';
import { todayIso } from './today';

export const SUBSCRIPTIONS_COLLECTION = 'subscriptions';

/**
 * Stop charging an organisation.
 *
 * Written with `setDoc` + merge rather than `updateDoc`, because the common case
 * is an organisation that has never subscribed and therefore has no document to
 * update — a promotion is most often granted the day the organisation is
 * created, before it has ever been billed.
 */
export async function grantPromotion(params: {
  orgId: string;
  note: string;
  grantedByUid: string;
}): Promise<void> {
  const note = params.note.trim();
  if (!params.orgId) throw new Error('Which organisation?');
  if (!note) throw new Error('Record why this organisation is not being charged.');

  await setDoc(
    doc(db, SUBSCRIPTIONS_COLLECTION, params.orgId),
    {
      orgId: params.orgId,
      status: 'promotional',
      promotionNote: note,
      grantedBy: params.grantedByUid,
      // Kept for the record even though nothing is charged, so the row still
      // says when the arrangement began.
      currentPeriodStart: todayIso(),
      // A promotion does not lapse on a date — `accessState` short-circuits on
      // the status before it looks at this. Set far out so a surface that
      // formats it without checking the status does not print a past date.
      currentPeriodEnd: '2099-12-31',
      pricePaise: 0,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Put an organisation back on the ordinary plan.
 *
 * Leaves the status as `none` rather than `active`: ending a promotion does not
 * collect any money, so claiming the organisation is paid up would be a lie the
 * billing panel then repeats. They are unsubscribed until they pay.
 */
export async function endPromotion(params: {
  orgId: string;
  actedByUid: string;
}): Promise<void> {
  const ref = doc(db, SUBSCRIPTIONS_COLLECTION, params.orgId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = snap.data() as Subscription;
  if (current.status !== 'promotional') return;

  await updateDoc(ref, {
    status: 'none',
    pricePaise: PLAN_PRICE_PAISE,
    promotionNote: '',
    grantedBy: params.actedByUid,
    updatedAt: serverTimestamp(),
  });
}
