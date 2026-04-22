import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeadsByTier } from '@/lib/dashboard/repository';
import { ProspectsClient } from '@/components/prospects/ProspectsClient';

// Stage pages depend on ?playId= and per-request data, so opt out of
// static prerender. Without this, Next.js 16 fails the build with
// 'useSearchParams() should be wrapped in a suspense boundary' for any
// client component (FunnelRibbon, ProjectRail) that reads search params.
export const dynamic = 'force-dynamic';


export default async function ProspectsPage() {
  const leads = await listLeadsByTier(createSupabaseAdmin(), 'prospect');
  const ready = leads.filter(
    (l) =>
      l.prospectStatus === 'replied_positive' ||
      l.prospectStatus === 'qualified',
  ).length;
  return (
    <>
      <TopBar
        title="Prospects"
        subtitle={`${leads.length} in test · ${ready} ready to promote`}
      />
      <ProspectsClient initialLeads={leads} />
    </>
  );
}
