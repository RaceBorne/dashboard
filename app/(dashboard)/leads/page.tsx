import { TopBar } from '@/components/sidebar/TopBar';
import { MOCK_LEADS } from '@/lib/mock/leads';
import { LeadsClient } from '@/components/leads/LeadsClient';

export default function LeadsPage() {
  return (
    <>
      <TopBar title="Leads" subtitle={String(MOCK_LEADS.length) + ' total'} />
      <LeadsClient initialLeads={MOCK_LEADS} />
    </>
  );
}
