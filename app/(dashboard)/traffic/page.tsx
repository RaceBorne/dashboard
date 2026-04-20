import { TopBar } from '@/components/sidebar/TopBar';
import { TrafficDashboard } from '@/components/traffic/TrafficDashboard';
import { getTrafficSnapshot } from '@/lib/traffic/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TrafficPage() {
  const snapshot = await getTrafficSnapshot();

  const subtitle = !snapshot.connected
    ? 'GA4 not connected'
    : snapshot.hasData
      ? `${snapshot.windowStart} → ${snapshot.windowEnd} · comparing to previous 28d`
      : 'Awaiting first sync';

  return (
    <>
      <TopBar title="Traffic" subtitle={subtitle} />
      <TrafficDashboard snapshot={snapshot} />
    </>
  );
}
