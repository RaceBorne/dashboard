import { TopBar } from '@/components/sidebar/TopBar';
import { NewPostClient } from '@/components/social/NewPostClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function InstagramPage() {
  return (
    <>
      <TopBar
        title="Instagram"
        subtitle="Post and schedule to Instagram"
      />
      <NewPostClient lockedPlatform="instagram" />
    </>
  );
}
