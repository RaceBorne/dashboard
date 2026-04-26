import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { getCampaign, getCampaignStats } from '@/lib/marketing/campaigns';
import { listGroups } from '@/lib/marketing/groups';
import { listSegments } from '@/lib/marketing/segments';
import { CampaignEditor } from '@/components/marketing/CampaignEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CampaignEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign, groups, segments, stats] = await Promise.all([
    getCampaign(id),
    listGroups(),
    listSegments(),
    getCampaignStats(id),
  ]);
  if (!campaign) notFound();
  return (
    <>
      <TopBar title={campaign.name || 'Untitled campaign'} subtitle="Email · Broadcasts" />
      <CampaignEditor
        mode="edit"
        campaign={campaign}
        groups={groups}
        segments={segments}
        initialStats={stats}
      />
    </>
  );
}
