import { TopBar } from '@/components/sidebar/TopBar';
import { listCampaigns, getCampaignStats } from '@/lib/marketing/campaigns';
import { StatisticsClient } from '@/components/marketing/StatisticsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function StatisticsPage() {
  const campaigns = await listCampaigns();
  // Pull per-campaign stats in parallel so the dashboard renders in
  // one round-trip's wait. Small accounts only — for large catalogs
  // this would need a server-side aggregate query.
  const statsList = await Promise.all(
    campaigns.map(async (c) => ({ campaign: c, stats: await getCampaignStats(c.id) })),
  );
  return (
    <>
      <TopBar
        title="Statistics"
        subtitle="Email · Performance across every campaign"
      />
      <StatisticsClient items={statsList} />
    </>
  );
}
