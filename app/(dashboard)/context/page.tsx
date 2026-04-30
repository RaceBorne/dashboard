import { TopBar } from '@/components/sidebar/TopBar';
import { ContextClient } from '@/components/context/ContextClient';
import { listContexts, getActiveContext } from '@/lib/context/activeContext';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContextPage() {
  const [contexts, active] = await Promise.all([listContexts(), getActiveContext()]);
  return (
    <>
      <TopBar title="Context" subtitle="Who the prospecting cockpit is speaking AS" />
      <ContextClient initial={contexts} activeId={active?.id ?? null} />
    </>
  );
}
