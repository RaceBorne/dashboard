import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeadsByTier } from '@/lib/dashboard/repository';
import { ProspectsClient } from '@/components/prospects/ProspectsClient';

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
