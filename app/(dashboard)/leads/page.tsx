import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeads } from '@/lib/dashboard/repository';
import { LeadsClient } from '@/components/leads/LeadsClient';

// Stage pages depend on ?playId= and per-request data, so opt out of
// static prerender. Without this, Next.js 16 fails the build with
// 'useSearchParams() should be wrapped in a suspense boundary' for any
// client component (FunnelRibbon, ProjectRail) that reads search params.
export const dynamic = 'force-dynamic';


export default async function LeadsPage() {
  const leads = await listLeads(createSupabaseAdmin());
  return (
    <>
      <TopBar title="Leads" subtitle={String(leads.length) + ' total'} />
      <LeadsClient initialLeads={leads} />
    </>
  );
}
