import { TopBar } from '@/components/sidebar/TopBar';
import { NewPostClient } from '@/components/social/NewPostClient';

export default function NewSocialPostPage() {
  return (
    <>
      <TopBar
        title="New post"
        subtitle="Designed here, scheduled to the calendar"
      />
      <NewPostClient />
    </>
  );
}
