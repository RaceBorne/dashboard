import { TopBar } from '@/components/sidebar/TopBar';
import { PerformanceClient } from '@/components/performance/PerformanceClient';
import { getPerformanceOverview } from '@/lib/performance/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PerformancePage() {
  const overview = await getPerformanceOverview();
  const source =
    overview.connected && overview.hasData
      ? 'PSI · last 30d'
      : overview.connected
        ? 'PSI connected · awaiting first run'
        : 'PSI not connected';
  return (
    <>
      <TopBar
        title="Performance"
        subtitle={`${overview.targets.length} URLs tracked · ${source}`}
      />
      <PerformanceClient overview={overview} />
    </>
  );
}
