import { TopBar } from '@/components/sidebar/TopBar';
import { NewPostClient } from '@/components/social/NewPostClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function TikTokPage() {
  return (
    <>
      <TopBar title="TikTok" subtitle="Post and schedule to TikTok" />
      <NewPostClient lockedPlatform="tiktok" />
    </>
  );
}
