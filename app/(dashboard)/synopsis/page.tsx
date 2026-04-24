import { TopBar } from '@/components/sidebar/TopBar';
import { getPagesOverview } from '@/lib/pages/overview';
import { analyseSynopsis } from '@/lib/synopsis/analyse';
import { SynopsisClient } from '@/components/synopsis/SynopsisClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /synopsis — "why is the site underperforming + what can we fix right now".
 *
 * Top: bullet summary of the current state (missing titles, missing
 * descriptions, high-impression / zero-click pages, critical findings).
 *
 * Bottom: fix list. Every row is either auto-fixable (the Fix button
 * generates new copy via the AI and writes it back to Shopify) or
 * manual (the recommendation is shown inline).
 */
export default async function SynopsisPage() {
  const overview = await getPagesOverview();
  const synopsis = analyseSynopsis(overview.rows);

  const subtitle =
    synopsis.issues.length === 0
      ? synopsis.totals.pages + ' pages · all clean'
      : synopsis.issues.length + ' issue' +
        (synopsis.issues.length === 1 ? '' : 's') +
        ' · ' + synopsis.totals.pages + ' pages scanned';

  return (
    <>
      <TopBar title="Synopsis" subtitle={subtitle} />
      <SynopsisClient synopsis={synopsis} />
    </>
  );
}
