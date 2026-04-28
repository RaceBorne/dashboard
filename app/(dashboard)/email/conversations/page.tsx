import { TopBar } from '@/components/sidebar/TopBar';
import { listConversations, getInboxCounts } from '@/lib/marketing/conversations';
import { ConversationsClient } from '@/components/marketing/ConversationsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConversationsPage() {
  // Pull a generous page of recent rows; the client groups them into
  // threads. 500 covers months of replies for most accounts.
  const [conversations, counts] = await Promise.all([
    listConversations({ limit: 500 }),
    getInboxCounts(),
  ]);
  return (
    <>
      <TopBar
        title="Conversations"
        subtitle="Email · Replies to your campaigns + outreach"
      />
      <ConversationsClient initialConversations={conversations} initialCounts={counts} />
    </>
  );
}
