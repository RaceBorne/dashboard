import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { getCampaign, getCampaignStats } from '@/lib/marketing/campaigns';
import { listGroups } from '@/lib/marketing/groups';
import { listSegments } from '@/lib/marketing/segments';
import { getCampaignAnalytics } from '@/lib/marketing/campaign-analytics';
import { getBrand } from '@/lib/marketing/brand';
import { listTemplates } from '@/lib/marketing/templates';
import { CampaignEditor } from '@/components/marketing/CampaignEditor';
import { CampaignAnalyticsTabs } from '@/components/marketing/CampaignAnalyticsTabs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CampaignEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign, groups, segments, stats, brand, templates] = await Promise.all([
    getCampaign(id),
    listGroups(),
    listSegments(),
    getCampaignStats(id),
    getBrand(),
    listTemplates(),
  ]);
  if (!campaign) notFound();
  // Only fetch analytics for sent / sending campaigns — drafts have nothing to show.
  const showAnalytics = campaign.status === 'sent' || campaign.status === 'sending';
  const analytics = showAnalytics
    ? await getCampaignAnalytics(campaign.id, campaign.content)
    : null;
  return (
    <>
      <TopBar title={campaign.name || 'Untitled campaign'} subtitle="Email · Broadcasts" />
      <CampaignEditor
        mode="edit"
        campaign={campaign}
        groups={groups}
        segments={segments}
        initialStats={stats}
        brand={brand}
        templates={templates}
      />
      {analytics ? (
        <div className="px-4 pb-4">
          <CampaignAnalyticsTabs analytics={analytics} />
        </div>
      ) : null}
    </>
  );
}
