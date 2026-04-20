import { TopBar } from '@/components/sidebar/TopBar';
import { Badge } from '@/components/ui/badge';
import { getPagesOverview } from '@/lib/pages/overview';
import { PagesClient } from '@/components/pages/PagesClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Pages — the master per-URL cockpit. Shows every product / online-store
 * page / blog article with live SEO data joined from the latest scan.
 * GSC + GA4 columns are stubbed client-side so the shape of the full view
 * is visible before those ingests land.
 */
export default async function PagesPage() {
  const overview = await getPagesOverview();

  const subtitle =
    overview.totals.total > 0
      ? `${overview.totals.total} URLs · ${overview.totals.withIssues} with issues`
      : 'loading…';

  return (
    <>
      <TopBar
        title="Pages"
        subtitle={subtitle}
        rightSlot={
          <Badge
            variant={overview.connected ? 'success' : 'muted'}
            className="gap-1.5"
          >
            <span
              className={
                'h-1.5 w-1.5 rounded-full ' +
                (overview.connected ? 'bg-evari-ink/60' : 'bg-evari-dimmer')
              }
            />
            {overview.connected ? 'Live · Shopify' : 'Mock data'}
          </Badge>
        }
      />
      <PagesClient overview={overview} />
    </>
  );
}
