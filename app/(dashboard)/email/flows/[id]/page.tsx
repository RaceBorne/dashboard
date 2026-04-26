import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { getFlow, listSteps } from '@/lib/marketing/flows';
import { FlowEditor } from '@/components/marketing/FlowEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FlowEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [flow, steps] = await Promise.all([getFlow(id), listSteps(id)]);
  if (!flow) notFound();
  return (
    <>
      <TopBar title={flow.name || 'Flow'} subtitle="Email · Automation" />
      <FlowEditor mode="edit" flow={flow} initialSteps={steps} />
    </>
  );
}
