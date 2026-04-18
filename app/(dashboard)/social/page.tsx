import { TopBar } from '@/components/sidebar/TopBar';
import { SocialCalendarClient } from '@/components/social/SocialCalendarClient';
import { MOCK_SOCIAL_POSTS } from '@/lib/mock/social';

export default function SocialPage() {
  return (
    <>
      <TopBar
        title="Social"
        subtitle="LinkedIn · Instagram · TikTok"
      />
      <SocialCalendarClient posts={MOCK_SOCIAL_POSTS} />
    </>
  );
}
