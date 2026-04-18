import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/sidebar/TopBar';
import { MOCK_LEADS } from '@/lib/mock/leads';
import { StageBadge } from '@/components/leads/StageBadge';
import { SourceBadge } from '@/components/leads/SourceBadge';
import { Badge } from '@/components/ui/badge';
import { formatGBP, relativeTime } from '@/lib/utils';

const STAGES = ['new', 'contacted', 'discovery', 'configuring', 'quoted', 'won', 'lost', 'cold'] as const;

export default function LeadsPage() {
  const counts = STAGES.reduce<Record<string, number>>((a, s) => {
    a[s] = MOCK_LEADS.filter((l) => l.stage === s).length;
    return a;
  }, {});

  const sorted = [...MOCK_LEADS].sort((a, b) => {
    const order: Record<string, number> = {
      new: 0, configuring: 1, discovery: 2, quoted: 3,
      contacted: 4, won: 5, cold: 6, lost: 7,
    };
    if (order[a.stage] !== order[b.stage]) return order[a.stage] - order[b.stage];
    return (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0);
  });

  const totalValue = MOCK_LEADS
    .filter((l) => !['won', 'lost', 'cold'].includes(l.stage))
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);

  return (
    <>
      <TopBar title="Leads" subtitle={String(MOCK_LEADS.length) + ' total'} />

      <div className="p-6 max-w-[1400px] space-y-5">
        <div className="rounded-lg border border-evari-edge bg-evari-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              Open pipeline
            </div>
            <div className="text-sm font-mono tabular-nums text-evari-text">
              {formatGBP(totalValue)}
            </div>
          </div>
          <div className="flex gap-1.5">
            {STAGES.filter((s) => !['lost', 'cold'].includes(s)).map((s) => {
              const total = MOCK_LEADS.filter((l) => !['lost', 'cold'].includes(l.stage)).length;
              const pct = total ? (counts[s] / total) * 100 : 0;
              return (
                <div
                  key={s}
                  className="flex-1 h-2 rounded-full bg-evari-edge overflow-hidden"
                  title={s + ': ' + counts[s]}
                >
                  <div className="h-full bg-primary" style={{ width: pct + '%' }} />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
            {STAGES.filter((s) => !['lost', 'cold'].includes(s)).map((s) => (
              <div key={s} className="text-[10px]">
                <div className="text-evari-dimmer uppercase tracking-wider mb-0.5">{s}</div>
                <div className="font-mono tabular-nums text-evari-text">{counts[s]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-evari-edge bg-evari-surface overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium border-b border-evari-edge">
            <div className="col-span-4">Lead</div>
            <div className="col-span-3">Interest</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-1 text-right">Value</div>
            <div className="col-span-1 text-right">Last touch</div>
            <div className="col-span-1 text-right">Stage</div>
          </div>

          <ul className="divide-y divide-evari-edge">
            {sorted.map((l) => (
              <li key={l.id}>
                <Link
                  href={'/leads/' + l.id}
                  className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center hover:bg-evari-carbon transition-colors group"
                >
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-evari-edge flex items-center justify-center text-[10px] text-evari-dim font-medium uppercase shrink-0">
                      {l.fullName.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-evari-text truncate">{l.fullName}</div>
                      <div className="text-xs text-evari-dim truncate">
                        {l.email}{l.location ? ' · ' + l.location : ''}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3 text-xs text-evari-dim truncate">
                    {l.productInterest ?? <span className="italic text-evari-dimmer">unspecified</span>}
                    {l.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {l.tags.slice(0, 2).map((t) => (
                          <Badge key={t} variant="outline" className="text-[9px] py-0">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <SourceBadge source={l.source} />
                  </div>
                  <div className="col-span-1 text-right text-xs font-mono tabular-nums text-evari-text">
                    {l.estimatedValue ? formatGBP(l.estimatedValue) : '—'}
                  </div>
                  <div className="col-span-1 text-right text-xs text-evari-dim font-mono tabular-nums">
                    {relativeTime(l.lastTouchAt)}
                  </div>
                  <div className="col-span-1 flex justify-end items-center gap-2">
                    <StageBadge stage={l.stage} />
                    <ChevronRight className="h-3.5 w-3.5 text-evari-dimmer opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
