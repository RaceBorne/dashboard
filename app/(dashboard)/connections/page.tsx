import { TopBar } from '@/components/sidebar/TopBar';
import { ConnectionsClient } from '@/components/connections/ConnectionsClient';
import { getIntegrationStatuses } from '@/lib/mock/integrations';

export default function ConnectionsPage() {
  const integrations = getIntegrationStatuses();
  const connected = integrations.filter((i) => i.connected).length;
  return (
    <>
      <TopBar
        title="Connections"
        subtitle={connected + ' of ' + integrations.length + ' connected'}
      />
      <ConnectionsClient integrations={integrations} />
    </>
  );
}
