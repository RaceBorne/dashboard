import { TopBar } from '@/components/sidebar/TopBar';
import { KlaviyoDashboardClient } from '@/components/klaviyo/KlaviyoDashboardClient';
import { getKlaviyoSnapshot } from '@/lib/klaviyo/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function KlaviyoPage() {
  const snapshot = await getKlaviyoSnapshot();

  const subtitle = !snapshot.connected
    ? 'Klaviyo not connected'
    : snapshot.hasData
      ? `${snapshot.windowStart} → ${snapshot.windowEnd} · comparing to previous 28d`
      : 'Awaiting first sync';

  return (
    <>
      <TopBar title="Klaviyo" subtitle={subtitle} />
      <KlaviyoDashboardClient snapshot={snapshot} />
    </>
  );
}
