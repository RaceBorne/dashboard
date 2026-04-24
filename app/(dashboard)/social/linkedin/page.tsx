import { TopBar } from '@/components/sidebar/TopBar';
import { NewPostClient } from '@/components/social/NewPostClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LinkedInPage() {
  return (
    <>
      <TopBar title="LinkedIn" subtitle="Post and schedule to LinkedIn" />
      <NewPostClient lockedPlatform="linkedin" />
    </>
  );
}
