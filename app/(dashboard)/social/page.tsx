import { TopBar } from '@/components/sidebar/TopBar';
import { SocialCalendarClient } from '@/components/social/SocialCalendarClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listSocialPosts } from '@/lib/dashboard/repository';

export default async function SocialPage() {
  const posts = await listSocialPosts(createSupabaseAdmin());
  return (
    <>
      <TopBar
        title="Social"
        subtitle="LinkedIn · Instagram · TikTok"
      />
      <SocialCalendarClient posts={posts} />
    </>
  );
}
