import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays } from '@/lib/dashboard/repository';
import type { Play, PlayStage } from '@/lib/types';
import { VentureHero } from '@/components/plays/VentureHero';
import { PlayRow } from '@/components/plays/PlayRow';
import { FunnelRibbon } from '@/components/nav/FunnelRibbon';

const STAGES: {
  key: PlayStage;
  label: string;
  hint: string;
}[] = [
  { key: 'idea', label: 'Ideas', hint: 'Parked, no commitment' },
  { key: 'researching', label: 'Researching', hint: 'Digging in' },
  { key: 'building', label: 'Building', hint: 'Messaging + audience' },
  { key: 'ready', label: 'Ready', hint: 'Awaiting launch' },
  { key: 'live', label: 'Live', hint: 'In market' },
  { key: 'retired', label: 'Retired', hint: 'Archived' },
];

export default async function VenturesPage() {
  const plays = await listPlays(createSupabaseAdmin());
  const byStage = new Map<PlayStage, Play[]>();
  for (const s of STAGES) byStage.set(s.key, []);
  for (const c of plays) {
    const arr = byStage.get(c.stage) ?? [];
    arr.push(c);
    byStage.set(c.stage, arr);
  }

  const total = plays.length;

  return (
    <>
      <TopBar
        title="Ventures"
        subtitle={total + ' in flight — idea → live'}
      />

      {/*
        Layout: the original generous clearspace (p-6 + space-y-6). Ribbon
        mounts at the top so the Ventures chip is visible in the funnel;
        hero is the primary action; the existing ventures list lives
        below as a smaller, secondary section.
      */}
      <div className="flex flex-col gap-[52px] px-6 pt-[52px] pb-[52px]">
        <FunnelRibbon stage="ventures" playId={plays[0]?.id ?? ""} />

        {/* Hero — big, the primary action on this page. */}
        <VentureHero />

        {/* Existing ventures — smaller section below the hero. */}
        {total > 0 ? (
          <section className="space-y-4">
            <div className="flex items-baseline gap-2 px-1">
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                Your ventures
              </h3>
              <span className="text-[11px] text-evari-dimmer/80">
                {total} total · idea → live
              </span>
            </div>

            {STAGES.map((s) => {
              const items = byStage.get(s.key) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={s.key} className="space-y-2">
                  <div className="flex items-center gap-3 px-1">
                    <h4 className="text-sm font-medium text-evari-text capitalize">
                      {s.label}
                    </h4>
                    <span className="text-[11px] text-evari-dimmer">
                      {s.hint} · {items.length}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((c) => (
                      <PlayRow key={c.id} play={c} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ) : (
          <div className="px-1 text-[12px] text-evari-dimmer">
            No ventures yet. Fill in the box above to start your first one.
          </div>
        )}
      </div>
    </>
  );
}
