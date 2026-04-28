import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { getCampaign, getCampaignStats } from '@/lib/marketing/campaigns';
import { listGroups } from '@/lib/marketing/groups';
import { listSegments } from '@/lib/marketing/segments';
import { getCampaignAnalytics } from '@/lib/marketing/campaign-analytics';
import { getBrand } from '@/lib/marketing/brand';
import { listTemplates } from '@/lib/marketing/templates';
import { CampaignEditor } from '@/components/marketing/CampaignEditor';
import { CampaignReport } from '@/components/marketing/CampaignReport';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const isSentLike = campaign.status === 'sent' || campaign.status === 'sending' || campaign.status === 'failed';

  // Sent / sending / failed campaigns are read-only — render the
  // analytics report instead of the editor. Drafts + scheduled keep
  // the editor for active iteration.
  if (isSentLike) {
    const [groups, segments, stats, analytics] = await Promise.all([
      listGroups(),
      listSegments(),
      getCampaignStats(id),
      getCampaignAnalytics(id, campaign.content),
    ]);
    const audienceLabel = campaign.segmentId
      ? (segments.find((s) => s.id === campaign.segmentId)?.name ?? 'Segment')
      : campaign.groupId
        ? (groups.find((g) => g.id === campaign.groupId)?.name ?? 'List')
        : campaign.recipientEmails && campaign.recipientEmails.length > 0
          ? `Custom (${campaign.recipientEmails.length})`
          : 'No audience';
    return (
      <>
        <TopBar title={campaign.name || 'Untitled campaign'} subtitle={`Email · ${campaign.kind === 'direct' ? 'Direct message' : 'Newsletter'} · Report`} />
        <CampaignReport
          campaign={campaign}
          analytics={analytics}
          audienceLabel={audienceLabel}
          recipientCount={stats.total}
        />
      </>
    );
  }

  // Draft / scheduled — keep the existing editor flow.
  const [groups, segments, stats, brand, templates] = await Promise.all([
    listGroups(),
    listSegments(),
    getCampaignStats(id),
    getBrand(),
    listTemplates(),
  ]);
  return (
    <>
      <TopBar title={campaign.name || 'Untitled campaign'} subtitle={`Email · ${campaign.kind === 'direct' ? 'Direct message' : 'Newsletter'} · Edit`} />
      <CampaignEditor
        mode="edit"
        campaign={campaign}
        groups={groups}
        segments={segments}
        initialStats={stats}
        brand={brand}
        templates={templates}
      />
    </>
  );
}
