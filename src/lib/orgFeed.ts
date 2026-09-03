/**
 * The Board — the organisation's own feed.
 *
 * What was here before was `announcements` in `src/data/common.ts`: a static
 * array, read-only, identical for every tenant, that nobody inside a company
 * could add to. It looked like a feature and was a decoration.
 *
 * This is the real thing, and it is Firestore-native from the first line
 * rather than another localStorage overlay to migrate later. Everyone in an
 * organisation reads the same board in real time, posts to it, reacts, and
 * replies.
 *
 * ## Reactions are a map, and that is a rules decision
 *
 * `reactions` is `{ [uid]: emoji }` on the post itself rather than a
 * subcollection, because `firestore.rules` can check that an update's diff
 * touches only the caller's own key:
 *
 *     request.resource.data.reactions.diff(resource.data.reactions)
 *       .affectedKeys().hasOnly([request.auth.uid])
 *
 * A subcollection would need a second rules block and a second read per post
 * to say the same thing, and a plain counter would let anyone increment
 * anything. This shape makes "you may react as yourself and nobody else" a
 * property of the storage rather than of the button.
 *
 * ## Celebrations are derived, not stored
 *
 * Birthdays and work anniversaries come from `dateOfBirth` and `dateOfJoining`
 * on the employee record, computed at read time (`src/data/celebrations.ts`).
 * Writing a post for each one would mean a scheduled job this project has no
 * backend for, and a year of stale documents the day somebody's date is
 * corrected. What the board offers instead is a composer pre-filled to wish
 * them — so the greeting is a real post by a real person.
 */
import { useEffect, useState } from 'react';
import {
  addDoc,
  collection as fsCollection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import type { UserProfile } from '@/lib/auth';

export const POSTS_COLLECTION = 'org_posts';
export const COMMENTS_SUBCOLLECTION = 'comments';

/** Longest a post may be. Long enough for a policy note, short enough to read. */
export const POST_MAX_LENGTH = 3000;
export const COMMENT_MAX_LENGTH = 1000;

/**
 * The reactions the board offers.
 *
 * A closed set, mirrored in `firestore.rules`. Free-text would mean arbitrary
 * strings on every post and a rule that cannot say what a reaction is.
 */
export const REACTIONS = ['👍', '🎉', '❤️', '👏', '💡'] as const;
export type Reaction = (typeof REACTIONS)[number];

export type PostKind = 'post' | 'announcement' | 'kudos';

export interface FeedPost {
  id: string;
  orgId: string;
  kind: PostKind;
  body: string;
  authorUid: string;
  authorName: string;
  /** The author's directory record, when their account is linked to one. */
  authorEmployeeId: string | null;
  /** ISO. Server time — the client's clock does not get a vote on ordering. */
  createdAt: string;
  editedAt?: string;
  /** uid → emoji. One reaction per person; reacting again replaces it. */
  reactions: Record<string, string>;
  commentCount: number;
  /** Administrators only. A pinned post sits above the feed. */
  pinned: boolean;
}

export interface FeedComment {
  id: string;
  body: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
}

export function feedOrgId(profile: UserProfile | null): string {
  return profile?.orgId || DEFAULT_ORG_KEY;
}

/** Firestore hands back a Timestamp; everything above wants the app's ISO string. */
function isoOf(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === 'string' ? value : '';
}

function toPost(id: string, data: Record<string, unknown>): FeedPost {
  return {
    id,
    orgId: String(data.orgId ?? ''),
    kind: (data.kind as PostKind) ?? 'post',
    body: String(data.body ?? ''),
    authorUid: String(data.authorUid ?? ''),
    authorName: String(data.authorName ?? ''),
    authorEmployeeId: (data.authorEmployeeId as string | null) ?? null,
    createdAt: isoOf(data.createdAt),
    ...(data.editedAt ? { editedAt: isoOf(data.editedAt) } : {}),
    reactions: (data.reactions as Record<string, string>) ?? {},
    commentCount: Number(data.commentCount ?? 0),
    pinned: Boolean(data.pinned),
  };
}

/**
 * The organisation's board, newest first, pinned posts above.
 *
 * Ordered by `createdAt` in the query so the server does the sorting and a
 * page of posts can be limited later without reordering the wrong subset. The
 * pin is applied after, because it is a display rule rather than an order.
 */
export function useFeed(profile: UserProfile | null) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const orgId = feedOrgId(profile);

  useEffect(() => {
    if (!profile?.uid) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(
        fsCollection(db, POSTS_COLLECTION),
        where('orgId', '==', orgId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => {
        const all = snap.docs.map((d) => toPost(d.id, d.data() as Record<string, unknown>));
        setPosts([...all.filter((p) => p.pinned), ...all.filter((p) => !p.pinned)]);
        setLoading(false);
      },
      (err) => {
        console.warn('[org-feed] could not subscribe:', err);
        setPosts([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [orgId, profile?.uid]);

  return { posts, loading };
}

/** The replies on one post, oldest first — a conversation reads downwards. */
export function useComments(postId: string | null) {
  const [comments, setComments] = useState<FeedComment[]>([]);

  useEffect(() => {
    if (!postId) {
      setComments([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        fsCollection(db, POSTS_COLLECTION, postId, COMMENTS_SUBCOLLECTION),
        orderBy('createdAt', 'asc'),
      ),
      (snap) => {
        setComments(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              body: String(data.body ?? ''),
              authorUid: String(data.authorUid ?? ''),
              authorName: String(data.authorName ?? ''),
              createdAt: isoOf(data.createdAt),
            };
          }),
        );
      },
      (err) => console.warn('[org-feed] could not subscribe to comments:', err),
    );
    return unsub;
  }, [postId]);

  return comments;
}

export async function publishPost(input: {
  profile: UserProfile | null;
  employeeId: string | null;
  kind: PostKind;
  body: string;
  pinned?: boolean;
}): Promise<boolean> {
  const { profile, employeeId, kind, body, pinned } = input;
  const text = body.trim();
  if (!profile?.uid || !text) return false;

  try {
    await addDoc(fsCollection(db, POSTS_COLLECTION), {
      orgId: feedOrgId(profile),
      kind,
      body: text.slice(0, POST_MAX_LENGTH),
      authorUid: profile.uid,
      authorName: profile.displayName || profile.email || 'Someone',
      authorEmployeeId: employeeId ?? null,
      // Server time, so the order of the board is not a function of whose
      // laptop clock is wrong.
      createdAt: serverTimestamp(),
      reactions: {},
      commentCount: 0,
      pinned: Boolean(pinned),
    });
    return true;
  } catch (err) {
    console.warn('[org-feed] could not publish:', err);
    return false;
  }
}

/**
 * React, un-react, or change a reaction.
 *
 * Writes the whole map with the caller's key set or removed, because the rules
 * check the diff — a `FieldValue.delete()` on a nested key produces a diff the
 * rule reads the same way, but rebuilding the map keeps the client's intent
 * and the stored value obviously identical.
 */
export async function setReaction(
  profile: UserProfile | null,
  post: FeedPost,
  reaction: Reaction | null,
): Promise<boolean> {
  if (!profile?.uid) return false;
  const next = { ...post.reactions };
  if (reaction === null || next[profile.uid] === reaction) delete next[profile.uid];
  else next[profile.uid] = reaction;

  try {
    await updateDoc(doc(db, POSTS_COLLECTION, post.id), { reactions: next });
    return true;
  } catch (err) {
    console.warn('[org-feed] could not react:', err);
    return false;
  }
}

export async function addComment(input: {
  profile: UserProfile | null;
  post: FeedPost;
  body: string;
}): Promise<boolean> {
  const { profile, post, body } = input;
  const text = body.trim();
  if (!profile?.uid || !text) return false;

  try {
    await addDoc(fsCollection(db, POSTS_COLLECTION, post.id, COMMENTS_SUBCOLLECTION), {
      orgId: feedOrgId(profile),
      body: text.slice(0, COMMENT_MAX_LENGTH),
      authorUid: profile.uid,
      authorName: profile.displayName || profile.email || 'Someone',
      createdAt: serverTimestamp(),
    });
    // The count is denormalised so the board can show it without reading every
    // subcollection. It is advisory: a failed increment leaves the number one
    // behind rather than losing the comment, which is the right way round.
    await updateDoc(doc(db, POSTS_COLLECTION, post.id), {
      commentCount: post.commentCount + 1,
    }).catch(() => {});
    return true;
  } catch (err) {
    console.warn('[org-feed] could not comment:', err);
    return false;
  }
}

/** Remove a post. The author's own, or an administrator clearing the board. */
export async function deletePost(postId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, POSTS_COLLECTION, postId));
    return true;
  } catch (err) {
    console.warn('[org-feed] could not delete:', err);
    return false;
  }
}

/** Pin or unpin. Administrators only — the rules say so as well. */
export async function setPinned(postId: string, pinned: boolean): Promise<boolean> {
  try {
    await updateDoc(doc(db, POSTS_COLLECTION, postId), { pinned });
    return true;
  } catch (err) {
    console.warn('[org-feed] could not pin:', err);
    return false;
  }
}

/** Edit your own post. `setDoc` with merge so the reactions map is untouched. */
export async function editPost(postId: string, body: string): Promise<boolean> {
  const text = body.trim();
  if (!text) return false;
  try {
    await setDoc(
      doc(db, POSTS_COLLECTION, postId),
      { body: text.slice(0, POST_MAX_LENGTH), editedAt: serverTimestamp() },
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn('[org-feed] could not edit:', err);
    return false;
  }
}
