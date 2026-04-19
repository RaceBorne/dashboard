import { TopBar } from '@/components/sidebar/TopBar';
import { MOCK_PROSPECTS } from '@/lib/mock/prospects';
import { ProspectsClient } from '@/components/prospects/ProspectsClient';

export default function ProspectsPage() {
  const ready = MOCK_PROSPECTS.filter(
    (p) => p.status === 'replied_positive' || p.status === 'qualified',
  ).length;
  return (
    <>
      <TopBar
        title="Prospects"
        subtitle={`${MOCK_PROSPECTS.length} in test · ${ready} ready to promote`}
      />
      <ProspectsClient initialProspects={MOCK_PROSPECTS} />
    </>
  );
}
