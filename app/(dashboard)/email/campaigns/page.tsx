import { TopBar } from '@/components/sidebar/TopBar';
import { listCampaigns, getCampaignStats } from '@/lib/marketing/campaigns';
import { CampaignsListClient } from '@/components/marketing/CampaignsListClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();
  const stats = await Promise.all(
    campaigns.map(async (c) => ({ id: c.id, stats: await getCampaignStats(c.id) })),
  );
  const statsMap = Object.fromEntries(stats.map((s) => [s.id, s.stats]));
  return (
    <>
      <TopBar title="Campaigns" subtitle="Email · Broadcasts" />
      <CampaignsListClient campaigns={campaigns} statsMap={statsMap} />
    </>
  );
}
