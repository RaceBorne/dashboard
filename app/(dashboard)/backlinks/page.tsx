import { TopBar } from '@/components/sidebar/TopBar';
import { BacklinksClient } from '@/components/backlinks/BacklinksClient';
import { getBacklinksOverview } from '@/lib/backlinks/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BacklinksPage() {
  const overview = await getBacklinksOverview();

  const totalBacklinks = overview.summaries.reduce((sum, s) => sum + s.backlinks, 0);
  const totalDomains = overview.summaries.reduce((sum, s) => sum + s.referringDomains, 0);

  const subtitle = !overview.connected
    ? 'DataForSEO not connected'
    : overview.hasData
      ? `${totalBacklinks.toLocaleString('en-GB')} backlinks · ${totalDomains.toLocaleString('en-GB')} domains · ${overview.summaries.length} targets`
      : 'DataForSEO connected · awaiting first ingest';

  return (
    <>
      <TopBar title="Backlinks" subtitle={subtitle} />
      <BacklinksClient overview={overview} />
    </>
  );
}
