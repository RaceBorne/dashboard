import { TopBar } from '@/components/sidebar/TopBar';
import { listFlows } from '@/lib/marketing/flows';
import { FlowsListClient } from '@/components/marketing/FlowsListClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FlowsPage() {
  const flows = await listFlows();
  return (
    <>
      <TopBar title="Flows" subtitle="Email · Automation" />
      <FlowsListClient flows={flows} />
    </>
  );
}
