/**
 * The Board — where an organisation talks to itself.
 *
 * Replaces the static `announcements` array, which was read-only, identical
 * for every tenant, and impossible for anyone inside a company to add to.
 *
 * Everything here is live: `useFeed` is an `onSnapshot` subscription, so a post
 * somebody makes on their phone appears on everyone else's board without a
 * refresh. Celebrations are derived from the directory rather than stored — see
 * src/data/celebrations.ts — and the button beside one opens the composer with
 * a greeting in it, so the wish is a real post by a real person rather than an
 * automated card nobody wrote.
 */
import { useMemo, useState } from 'react';
import { Megaphone, Cake, Send, Pin, Trash2, PartyPopper, MessageSquare } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyEmployeeId } from '@/lib/useMyEmployeeId';
import { getEmployeeDirectory } from '@/data/employees';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { greetingFor, upcomingCelebrations, whenLabel } from '@/data/celebrations';
import {
  REACTIONS,
  addComment,
  deletePost,
  publishPost,
  setPinned,
  setReaction,
  useComments,
  useFeed,
  type FeedPost,
  type PostKind,
  type Reaction,
} from '@/lib/orgFeed';
import { timeAgo } from '@/lib/utils';

const KIND_LABEL: Record<PostKind, string> = {
  post: 'Post',
  announcement: 'Announcement',
  kudos: 'Kudos',
};

export function FeedPage() {
  const { profile, isAdmin } = useAuth();
  const canPin = isAdmin || profile?.role === 'hr';
  const { employeeId: myEmployeeId } = useMyEmployeeId(profile);
  const directoryRevision = useEmployeeDirectoryRevision();
  const { posts, loading } = useFeed(profile);

  const [body, setBody] = useState('');
  const [kind, setKind] = useState<PostKind>('post');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const celebrations = useMemo(
    () => upcomingCelebrations(getEmployeeDirectory()),
    [directoryRevision],
  );

  async function submit() {
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    const ok = await publishPost({ profile, employeeId: myEmployeeId, kind, body });
    setPosting(false);
    if (!ok) {
      // Reaching this means the rules and the UI disagree, and silence would
      // look exactly like a post that landed.
      setError('That could not be posted. Try again, or tell your administrator if it keeps happening.');
      return;
    }
    setBody('');
    setKind('post');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="The Board"
        subtitle="What is happening across the organisation — posted by the people in it."
      />

      {celebrations.length > 0 && (
        <Card>
          <CardHeader
            title="Coming up"
            subtitle="Birthdays and work anniversaries this week, from everyone's own record."
          />
          <div className="flex flex-wrap gap-2">
            {celebrations.map((celebration) => (
              <div
                key={`${celebration.kind}-${celebration.employeeId}`}
                className="flex items-center gap-3 border border-ink-200 bg-ink-100 px-3 py-2"
              >
                {celebration.kind === 'birthday' ? (
                  <Cake size={16} className="text-brand-600 shrink-0" />
                ) : (
                  <PartyPopper size={16} className="text-ink-700 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-semibold text-ink-900 leading-tight">
                    {celebration.name}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-ink-500">
                    {whenLabel(celebration.inDays)} ·{' '}
                    {celebration.kind === 'birthday'
                      ? 'Birthday'
                      : `${celebration.years} years`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setKind('kudos');
                    setBody(greetingFor(celebration));
                  }}
                >
                  Wish them
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Composer */}
      <Card>
        <div className="flex gap-3">
          <Avatar name={profile?.displayName || profile?.email || 'You'} size="md" />
          <div className="flex-1 space-y-3">
            <textarea
              className="input min-h-[92px] resize-y"
              placeholder="Share something with the organisation…"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-label="Write a post"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-52">
                <Select
                  ariaLabel="Post type"
                  value={kind}
                  onChange={(value) => setKind(value as PostKind)}
                  options={[
                    { label: 'Post', value: 'post' },
                    { label: 'Kudos', value: 'kudos' },
                    ...(canPin ? [{ label: 'Announcement', value: 'announcement' }] : []),
                  ]}
                />
              </div>
              <Button icon={<Send size={15} />} onClick={submit} disabled={posting || !body.trim()}>
                {posting ? 'Posting…' : 'Post'}
              </Button>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card><p className="text-sm text-ink-500">Loading the board…</p></Card>
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone size={26} />}
            title="Nothing on the board yet"
            description="Be the first — a welcome, a policy note, or a thank-you to somebody who earned one."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canPin={canPin}
              canDelete={canPin || post.authorUid === profile?.uid}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  canPin,
  canDelete,
}: {
  post: FeedPost;
  canPin: boolean;
  canDelete: boolean;
}) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const comments = useComments(open ? post.id : null);

  const mine = profile?.uid ? post.reactions[profile.uid] : undefined;
  // Grouped for the summary row: which emoji, and how many people chose it.
  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const emoji of Object.values(post.reactions)) {
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [post.reactions]);

  return (
    <Card className={post.pinned ? 'border-brand-600' : undefined}>
      <div className="flex items-start gap-3">
        <Avatar name={post.authorName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink-900">{post.authorName}</p>
            {post.kind !== 'post' && (
              <Badge tone={post.kind === 'announcement' ? 'blue' : 'green'}>
                {KIND_LABEL[post.kind]}
              </Badge>
            )}
            {post.pinned && (
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-brand-700">
                <Pin size={11} /> Pinned
              </span>
            )}
            <span className="text-xs text-ink-500">
              {post.createdAt ? timeAgo(post.createdAt) : 'just now'}
              {post.editedAt ? ' · edited' : ''}
            </span>
          </div>

          <p className="mt-2 text-[15px] text-ink-800 whitespace-pre-wrap break-words">
            {post.body}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React ${emoji}`}
                aria-pressed={mine === emoji}
                onClick={() => void setReaction(profile, post, emoji as Reaction)}
                className={`border px-2 py-1 text-sm transition-colors ${
                  mine === emoji
                    ? 'border-brand-600 bg-brand-100'
                    : 'border-ink-200 hover:bg-ink-100'
                }`}
              >
                {emoji}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="ml-1 inline-flex items-center gap-1.5 border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-100"
            >
              <MessageSquare size={13} />
              {post.commentCount > 0
                ? `${post.commentCount} ${post.commentCount === 1 ? 'reply' : 'replies'}`
                : 'Reply'}
            </button>

            {tally.length > 0 && (
              <span className="text-xs text-ink-500">
                {tally.map(([emoji, count]) => `${emoji} ${count}`).join('  ')}
              </span>
            )}

            <span className="ml-auto flex items-center gap-1">
              {canPin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void setPinned(post.id, !post.pinned)}
                >
                  {post.pinned ? 'Unpin' : 'Pin'}
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => void deletePost(post.id)}
                >
                  Delete
                </Button>
              )}
            </span>
          </div>

          {open && (
            <div className="mt-4 border-t border-ink-200 pt-3 space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <Avatar name={comment.authorName} size="xs" />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold text-ink-900">{comment.authorName}</span>{' '}
                      <span className="text-xs text-ink-500">
                        {comment.createdAt ? timeAgo(comment.createdAt) : 'just now'}
                      </span>
                    </p>
                    <p className="text-sm text-ink-800 whitespace-pre-wrap break-words">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Write a reply…"
                  aria-label="Write a reply"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && reply.trim()) {
                      void addComment({ profile, post, body: reply }).then(() => setReply(''));
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={!reply.trim()}
                  onClick={() =>
                    void addComment({ profile, post, body: reply }).then(() => setReply(''))
                  }
                >
                  Send reply
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default FeedPage;
