import { TopBar } from '@/components/sidebar/TopBar';
import { listCampaigns, getCampaignStats } from '@/lib/marketing/campaigns';
import { listGroups } from '@/lib/marketing/groups';
import { listSegments } from '@/lib/marketing/segments';
import { CampaignsListClient } from '@/components/marketing/CampaignsListClient';
import { FollowupInbox } from '@/components/marketing/FollowupInbox';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CampaignsPage() {
  const [campaigns, groups, segments] = await Promise.all([
    listCampaigns(),
    listGroups(),
    listSegments(),
  ]);
  const stats = await Promise.all(
    campaigns.map(async (c) => ({ id: c.id, stats: await getCampaignStats(c.id) })),
  );
  const statsMap = Object.fromEntries(stats.map((s) => [s.id, s.stats]));
  return (
    <>
      <TopBar title="Campaigns" subtitle="Email · Broadcasts" />
      <div className="px-4 pt-3"><FollowupInbox /></div>
      <CampaignsListClient
        campaigns={campaigns}
        statsMap={statsMap}
        groupsMap={Object.fromEntries(groups.map((g) => [g.id, g.name]))}
        segmentsMap={Object.fromEntries(segments.map((s) => [s.id, s.name]))}
      />
    </>
  );
}
