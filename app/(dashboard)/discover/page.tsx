import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays } from '@/lib/dashboard/repository';
import { DiscoveryDashboard } from '@/components/discover/DiscoveryDashboard';
import { StrategyTimeline } from '@/components/marketing/strategy/StrategyTimeline';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage({
  searchParams,
}: { searchParams: Promise<{ playId?: string }> }) {
  const params = await searchParams;
  const sb = createSupabaseAdmin();
  const plays = sb ? await listPlays(sb) : [];
  if (plays.length === 0) {
    return (
      <>
        <TopBar title="Discovery" subtitle="Find and validate companies that match your ideal customer profile." />
        <div className="flex-1 flex items-center justify-center bg-evari-ink p-8">
          <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-6 max-w-md text-center">
            <p className="text-[13px] text-evari-text mb-3">Start with an idea, build the strategy, then come here to discover companies.</p>
            <Link href="/ideas" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">Go to Ideas</Link>
          </div>
        </div>
      </>
    );
  }
  const playId = params.playId ?? plays[0].id;
  const play = plays.find((p) => p.id === playId);
  if (!play) redirect(`/discover?playId=${plays[0].id}`);
  return (
    <>
      <TopBar title="Discovery" subtitle={`From idea: ${play!.title}`} />
      <div className="flex-1 min-h-0 flex flex-col bg-evari-ink relative">
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full max-w-[1240px] 2xl:max-w-[1380px] mx-auto px-4 sm:px-6 2xl:px-10 py-5 pb-28 overflow-y-auto">
            <DiscoveryDashboard
              plays={plays.map((p) => ({ id: p.id, title: p.title }))}
              play={{ id: play!.id, title: play!.title }}
            />
          </div>
        </div>
        <StrategyTimeline mode="external" external="discovery" playId={play!.id} />
      </div>
    </>
  );
}
