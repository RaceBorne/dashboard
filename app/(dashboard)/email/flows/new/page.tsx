import { TopBar } from '@/components/sidebar/TopBar';
import { FlowEditor } from '@/components/marketing/FlowEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function NewFlowPage() {
  return (
    <>
      <TopBar title="New flow" subtitle="Email · Automation" />
      <FlowEditor mode="new" />
    </>
  );
}
