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
        Layout mirrors the other stage pages: FunnelRibbon up top (Ventures
        chip active, others disabled because no venture is selected yet),
        then the hero, then the compact list at the bottom.
      */}
      <div className="flex flex-col gap-3 p-4">
        <FunnelRibbon stage="ventures" playId="" />

        {/* Hero — big, the primary action on this page. */}
        <VentureHero />

        {/* Existing ventures — demoted to a compact section below. */}
        {total > 0 ? (
          <section className="space-y-3 pt-2">
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
                <div key={s.key} className="space-y-1.5">
                  <div className="flex items-center gap-2 px-1">
                    <h4 className="text-[12px] font-medium text-evari-text capitalize">
                      {s.label}
                    </h4>
                    <span className="text-[10px] text-evari-dimmer">
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
          <div className="px-1 pt-2 text-[12px] text-evari-dimmer">
            No ventures yet. Fill in the box above to start your first one.
          </div>
        )}
      </div>
    </>
  );
}
