import { TopBar } from '@/components/sidebar/TopBar';
import { listGroups } from '@/lib/marketing/groups';
import { listSegments } from '@/lib/marketing/segments';
import { CampaignEditor } from '@/components/marketing/CampaignEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NewCampaignPage() {
  const [groups, segments] = await Promise.all([listGroups(), listSegments()]);
  return (
    <>
      <TopBar title="New campaign" subtitle="Email · Broadcasts" />
      <CampaignEditor mode="new" groups={groups} segments={segments} />
    </>
  );
}
