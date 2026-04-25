import { TopBar } from '@/components/sidebar/TopBar';
import { SocialCalendarClient } from '@/components/social/SocialCalendarClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listSocialPosts } from '@/lib/dashboard/repository';
import { listDrafts } from '@/lib/journals/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SocialPage() {
  const [posts, allDrafts] = await Promise.all([
    listSocialPosts(createSupabaseAdmin()),
    listDrafts(),
  ]);
  // Only Departure Lounge drafts (scheduled but not yet published)
  // appear on the calendar. Pass plain serialisable shape; the
  // client converts to CalendarEvents alongside the social posts.
  const journalDrafts = allDrafts
    .filter((d) => d.scheduledFor && !d.shopifyArticleId)
    .map((d) => ({
      id: d.id,
      title: (d.title || 'Untitled draft').replace(/<[^>]*>/g, '').trim(),
      scheduledFor: d.scheduledFor as string,
      blogTarget: d.blogTarget,
      coverImageUrl: d.coverImageUrl,
    }));
  return (
    <>
      <TopBar
        title="Social"
        subtitle="LinkedIn · Instagram · TikTok · Journals"
      />
      <SocialCalendarClient posts={posts} journalDrafts={journalDrafts} />
    </>
  );
}
