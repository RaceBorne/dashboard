import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays } from '@/lib/dashboard/repository';
import { enrichmentSummary, listEnrichment } from '@/lib/marketing/enrichment';
import { EnrichmentClient } from '@/components/marketing/EnrichmentClient';

export const dynamic = 'force-dynamic';

export default async function EnrichmentPage({
  searchParams,
}: { searchParams: Promise<{ playId?: string }> }) {
  const params = await searchParams;
  const sb = createSupabaseAdmin();
  const plays = await listPlays(sb);
  if (plays.length === 0) {
    return (
      <>
        <TopBar title="Enrichment" subtitle="Find the right people, enrich their details and build your target list." />
        <div className="flex-1 flex items-center justify-center bg-evari-ink p-8">
          <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-6 max-w-md text-center">
            <p className="text-[13px] text-evari-text mb-3">No ideas yet. Start with an idea, build the strategy, run discovery, shortlist, then enrich.</p>
            <Link href="/ideas" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">Go to Ideas</Link>
          </div>
        </div>
      </>
    );
  }
  const playId = params.playId ?? plays[0].id;
  const play = plays.find((p) => p.id === playId) ?? plays[0];
  const [items, summary] = await Promise.all([listEnrichment(play.id), enrichmentSummary(play.id)]);
  return (
    <>
      <TopBar title="Enrichment" subtitle={`From idea: ${play.title}`} />
      <EnrichmentClient
        plays={plays.map((p) => ({ id: p.id, title: p.title }))}
        play={{ id: play.id, title: play.title }}
        initial={items}
        summary={summary}
      />
    </>
  );
}
