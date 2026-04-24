import { TopBar } from '@/components/sidebar/TopBar';
import { getPagesOverview } from '@/lib/pages/overview';
import { getKeywordWorkspace } from '@/lib/keywords/workspace';
import { getBacklinksOverview } from '@/lib/backlinks/repository';
import { getTrafficSnapshot } from '@/lib/traffic/repository';
import { getPerformanceOverview } from '@/lib/performance/repository';
import { analyseSynopsis } from '@/lib/synopsis/analyse';
import { SynopsisClient } from '@/components/synopsis/SynopsisClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /synopsis — the central repair bench.
 *
 *   1. Narrative paragraph (fetched client-side so Refresh can regenerate it)
 *   2. Bullet summary of the current state
 *   3. Fix list for immediate one-click fixes
 *   4. Enhance list for broader improvements (keyword research, meta rewrites,
 *      internal link proposals, blog topic drafts)
 *
 * Every signal we collect elsewhere feeds into this one page so it can stay
 * honest about where the site is and what to do next.
 */
export default async function SynopsisPage() {
  // Pull every signal in parallel. Each source degrades gracefully — missing
  // credentials just null out that slice of the context.
  const [overview, keywords, backlinks, traffic, performance] = await Promise.all([
    getPagesOverview(),
    safeCall(() => getKeywordWorkspace()),
    safeCall(() => getBacklinksOverview()),
    safeCall(() => getTrafficSnapshot()),
    safeCall(() => getPerformanceOverview()),
  ]);

  const synopsis = analyseSynopsis({
    rows: overview.rows,
    keywords,
    backlinks,
    traffic,
    performance,
  });

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

async function safeCall<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
