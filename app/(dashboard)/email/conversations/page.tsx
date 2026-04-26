import { TopBar } from '@/components/sidebar/TopBar';
import { listConversations, getInboxCounts } from '@/lib/marketing/conversations';
import { ConversationsClient } from '@/components/marketing/ConversationsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConversationsPage() {
  const [conversations, counts] = await Promise.all([
    listConversations({ limit: 200 }),
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
