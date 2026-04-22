import { TopBar } from '@/components/sidebar/TopBar';
import { ConversationsClient } from '@/components/conversations/ConversationsClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeads, listThreads } from '@/lib/dashboard/repository';

interface PageProps {
  searchParams: Promise<{ thread?: string }>;
}

// Stage pages depend on ?playId= and per-request data, so opt out of
// static prerender. Without this, Next.js 16 fails the build with
// 'useSearchParams() should be wrapped in a suspense boundary' for any
// client component (FunnelRibbon, ProjectRail) that reads search params.
export const dynamic = 'force-dynamic';


export default async function ConversationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = createSupabaseAdmin();
  const [threads, leads] = await Promise.all([listThreads(supabase), listLeads(supabase)]);
  const initialThreadId = sp.thread ?? threads[0]?.id ?? '';
  return (
    <>
      <TopBar
        title="Conversations"
        subtitle={String(threads.filter((t) => t.unread).length) + ' unread'}
      />
      <ConversationsClient
        threads={threads}
        leads={leads}
        initialThreadId={initialThreadId}
      />
    </>
  );
}
