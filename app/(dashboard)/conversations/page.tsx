import { TopBar } from '@/components/sidebar/TopBar';
import { ConversationsClient } from '@/components/conversations/ConversationsClient';
import { MOCK_THREADS } from '@/lib/mock/conversations';
import { MOCK_LEADS } from '@/lib/mock/leads';

interface PageProps {
  searchParams: Promise<{ thread?: string }>;
}

export default async function ConversationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const initialThreadId = sp.thread ?? MOCK_THREADS[0]?.id ?? '';
  return (
    <>
      <TopBar title="Conversations" subtitle={String(MOCK_THREADS.filter((t) => t.unread).length) + ' unread'} />
      <ConversationsClient
        threads={MOCK_THREADS}
        leads={MOCK_LEADS}
        initialThreadId={initialThreadId}
      />
    </>
  );
}
