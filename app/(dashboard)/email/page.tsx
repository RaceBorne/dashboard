import { TopBar } from '@/components/sidebar/TopBar';
import { getAnalytics } from '@/lib/marketing/analytics';
import { isStubSender } from '@/lib/marketing/sender';
import { AnalyticsClient } from '@/components/marketing/AnalyticsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Email module landing — analytics dashboard. Server pre-renders with
 * the default 30d window so the page loads populated; the client
 * re-fetches when the user changes the range.
 */
export default async function EmailHomePage() {
  const summary = await getAnalytics('30d');
  return (
    <>
      <TopBar title="Email" subtitle="Analytics overview" />
      <AnalyticsClient initialSummary={summary} senderMode={isStubSender() ? 'stub' : 'live'} />
    </>
  );
}
