import { TopBar } from '@/components/sidebar/TopBar';
import { getKeywordWorkspace } from '@/lib/keywords/workspace';
import { KeywordsWorkspaceClient } from '@/components/keywords/KeywordsWorkspaceClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function KeywordsPage() {
  const workspace = await getKeywordWorkspace();

  const ownList = workspace.lists.find((l) => l.kind === 'own');
  const competitorCount = workspace.lists.filter((l) => l.kind === 'competitor').length;

  const subtitle = !workspace.connected
    ? 'DataForSEO not connected'
    : workspace.hasData
      ? `${ownList?.memberCount ?? 0} own · ${competitorCount} competitor list${competitorCount === 1 ? '' : 's'}`
      : 'Workspace ready · awaiting first ingest';

  return (
    <>
      <TopBar title="Keywords" subtitle={subtitle} />
      <KeywordsWorkspaceClient workspace={workspace} />
    </>
  );
}
