import { TopBar } from '@/components/sidebar/TopBar';
import { ConnectorsClient } from '@/components/settings/ConnectorsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Settings → Connectors
 *
 * Grid of every external API the dashboard can use, grouped by category.
 * Each card shows live status, last-tested timestamp, and a Configure
 * button that opens an inline side panel for the provider's fields.
 *
 * Phase 1: single-tenant. Phase 2 threads org_id through every read.
 */
export default function ConnectorsPage() {
  return (
    <>
      <TopBar
        title="Connectors"
        subtitle="Every external API the dashboard can talk to"
      />
      <div className="p-6 max-w-[1200px]">
        <ConnectorsClient />
      </div>
    </>
  );
}
