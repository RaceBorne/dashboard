import { TopBar } from '@/components/sidebar/TopBar';
import { DiscoverClient } from '@/components/discover/DiscoverClient';
import { DiscoverAIBinding } from '@/components/discover/DiscoverAIBinding';
import { DiscoverStatsStrip } from '@/components/discover/DiscoverStatsStrip';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays } from '@/lib/dashboard/repository';

// Stage pages depend on ?playId= and per-request data, so opt out of
// static prerender. Without this, Next.js 16 fails the build with
// 'useSearchParams() should be wrapped in a suspense boundary' for any
// client component (FunnelRibbon, ProjectRail) that reads search params.
export const dynamic = 'force-dynamic';


export default async function DiscoverPage() {
  const supabase = createSupabaseAdmin();
  const plays = supabase ? await listPlays(supabase) : [];
  const playOptions = plays.map((p) => ({ id: p.id, title: p.title, category: p.category }));

  return (
    <>
      <TopBar
        title="Discover"
        subtitle="Find companies and email addresses beyond the pipeline"
      />
      <DiscoverAIBinding />
      <div className="px-4 pt-3"><DiscoverStatsStrip /></div>
      <DiscoverClient plays={playOptions} />
    </>
  );
}
