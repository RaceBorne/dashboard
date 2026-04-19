import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeads } from '@/lib/dashboard/repository';
import { LeadsClient } from '@/components/leads/LeadsClient';

export default async function LeadsPage() {
  const leads = await listLeads(createSupabaseAdmin());
  return (
    <>
      <TopBar title="Leads" subtitle={String(leads.length) + ' total'} />
      <LeadsClient initialLeads={leads} />
    </>
  );
}
