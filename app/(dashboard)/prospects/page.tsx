import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listProspects } from '@/lib/dashboard/repository';
import { ProspectsClient } from '@/components/prospects/ProspectsClient';

export default async function ProspectsPage() {
  const prospects = await listProspects(createSupabaseAdmin());
  const ready = prospects.filter(
    (p) => p.status === 'replied_positive' || p.status === 'qualified',
  ).length;
  return (
    <>
      <TopBar
        title="Prospects"
        subtitle={`${prospects.length} in test · ${ready} ready to promote`}
      />
      <ProspectsClient initialProspects={prospects} />
    </>
  );
}
