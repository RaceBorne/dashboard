import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * The legacy /discover/search page (filter rail + Find companies) was
 * confusing because the new /discover already runs an AI-powered
 * auto-scan. Redirect any old links straight back to the main Discover
 * page so there's a single surface.
 */
export default async function DiscoverSearchPage({
  searchParams,
}: { searchParams: Promise<{ playId?: string }> }) {
  const params = await searchParams;
  const qs = params.playId ? `?playId=${encodeURIComponent(params.playId)}` : '';
  redirect(`/discover${qs}`);
}
