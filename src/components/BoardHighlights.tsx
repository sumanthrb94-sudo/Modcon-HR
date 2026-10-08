import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFeed } from '@/lib/orgFeed';
import { formatDate } from '@/lib/utils';

/**
 * The newest posts on The Board, for the dashboards.
 *
 * Both dashboards read a static `announcements` array that nobody inside a
 * company could add to — empty for every real organisation, forever — while
 * the organisation's actual noticeboard lived one click away. This shows that
 * noticeboard instead.
 */
export function BoardHighlights({ limit = 3 }: { limit?: number }) {
  const { profile } = useAuth();
  const { posts, loading } = useFeed(profile);
  const latest = posts.slice(0, limit);
  return (
    <Card>
      <CardHeader
        title="The Board"
        subtitle="Latest from your organisation"
        action={<Link to="/board" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Open the Board</Link>}
      />
      {loading ? null : latest.length === 0 ? (
        <p className="py-6 text-sm text-ink-400">Nothing posted yet. Anyone can post on the Board.</p>
      ) : (
        <div className="space-y-4">
          {latest.map((post) => (
            <Link key={post.id} to="/board" className="group flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-brand-50">
                <Megaphone size={14} className="text-brand-600" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink-800 line-clamp-2 group-hover:text-brand-700">{post.body}</span>
                <span className="mt-0.5 block text-[11px] text-ink-400">
                  {post.authorName}{post.createdAt ? ` · ${formatDate(post.createdAt.slice(0, 10))}` : ''}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
