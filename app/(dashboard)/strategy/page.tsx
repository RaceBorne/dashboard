import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays } from '@/lib/dashboard/repository';
import { getOrCreateBrief } from '@/lib/marketing/strategy';
import { StrategyClient } from '@/components/marketing/StrategyClient';

export const dynamic = 'force-dynamic';

export default async function StrategyPage({
  searchParams,
}: { searchParams: Promise<{ playId?: string }> }) {
  const params = await searchParams;
  const sb = createSupabaseAdmin();
  const plays = await listPlays(sb);
  if (plays.length === 0) {
    return (
      <>
        <TopBar title="Strategy" subtitle="Define the strategy and target profile for an idea" />
        <div className="flex-1 flex items-center justify-center bg-evari-ink p-8">
          <div className="rounded-md bg-evari-surface border border-evari-edge/30 p-6 max-w-md text-center">
            <p className="text-[13px] text-evari-text mb-3">You need an idea before you can build a strategy for it.</p>
            <Link href="/ideas" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">Go to Ideas</Link>
          </div>
        </div>
      </>
    );
  }
  const playId = params.playId ?? plays[0].id;
  const play = plays.find((p) => p.id === playId);
  if (!play) redirect(`/strategy?playId=${plays[0].id}`);
  const brief = await getOrCreateBrief(playId);
  return (
    <>
      <TopBar title="Strategy" subtitle={`From idea: ${play!.title}`} />
      <StrategyClient
        plays={plays.map((p) => ({ id: p.id, title: p.title }))}
        play={{ id: play!.id, title: play!.title, brief: play!.brief }}
        initialBrief={brief}
      />
    </>
  );
}
