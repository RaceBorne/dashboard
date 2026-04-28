import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays } from '@/lib/dashboard/repository';
import { listShortlist } from '@/lib/marketing/shortlist';
import { ShortlistClient } from '@/components/marketing/ShortlistClient';

export const dynamic = 'force-dynamic';

export default async function ShortlistPage({
  searchParams,
}: { searchParams: Promise<{ playId?: string }> }) {
  const params = await searchParams;
  const sb = createSupabaseAdmin();
  const plays = await listPlays(sb);
  if (plays.length === 0) {
    return (
      <>
        <TopBar title="Shortlist" subtitle="Review and select the best fit companies to take forward." />
        <div className="flex-1 flex items-center justify-center bg-evari-ink p-8">
          <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-6 max-w-md text-center">
            <p className="text-[13px] text-evari-text mb-3">Start with an idea, then run Discovery to populate a shortlist.</p>
            <Link href="/ideas" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">Go to Ideas</Link>
          </div>
        </div>
      </>
    );
  }
  const playId = params.playId ?? plays[0].id;
  const play = plays.find((p) => p.id === playId) ?? plays[0];
  const items = await listShortlist(play.id);
  return (
    <>
      <TopBar title="Shortlist" subtitle={`From idea: ${play.title}`} />
      <ShortlistClient
        plays={plays.map((p) => ({ id: p.id, title: p.title }))}
        play={{ id: play.id, title: play.title }}
        initial={items}
      />
    </>
  );
}
