'use client';

/**
 * Stats strip for the Discovery page. Listens via the discover-stats
 * window event for live updates from the existing DiscoverClient
 * (which fires `evari:discover-stats` with shape { found, analysed,
 * highFit, shortlisted, status }). Anything not provided keeps its
 * previous value, so we get cumulative state during a streaming
 * search.
 *
 * Pure UI — no logic of its own. Replaces the small grey strip we had
 * with the bigger, founder-facing stats row from the new design.
 */

import { useEffect, useState } from 'react';
import { Activity, Database, Sparkles, Star, Target } from 'lucide-react';

interface Stats {
  status: 'idle' | 'active' | 'done';
  found: number;
  analysed: number;
  highFit: number;
  shortlisted: number;
}

const INITIAL: Stats = { status: 'idle', found: 0, analysed: 0, highFit: 0, shortlisted: 0 };

export function DiscoverStatsStrip() {
  const [s, setS] = useState<Stats>(INITIAL);

  useEffect(() => {
    function on(e: Event) {
      const detail = (e as CustomEvent).detail as Partial<Stats>;
      if (!detail) return;
      setS((cur) => ({ ...cur, ...detail }));
    }
    window.addEventListener('evari:discover-stats', on);
    return () => window.removeEventListener('evari:discover-stats', on);
  }, []);

  return (
    <div className="grid grid-cols-5 gap-2 mb-2">
      <Stat label="Search status" value={s.status === 'active' ? 'Active' : s.status === 'done' ? 'Complete' : 'Idle'} sub={s.status === 'active' ? 'Running' : s.status === 'done' ? 'Finished' : 'Run a search'} icon={<Activity className="h-4 w-4" />} pulse={s.status === 'active'} />
      <Stat label="Companies found" value={String(s.found)} icon={<Database className="h-4 w-4" />} />
      <Stat label="Analysed" value={s.found > 0 ? `${Math.round((s.analysed / s.found) * 100)}%` : '—'} sub={`${s.analysed} of ${s.found}`} icon={<Sparkles className="h-4 w-4" />} />
      <Stat label="High fit" value={String(s.highFit)} sub={s.found > 0 ? `${Math.round((s.highFit / s.found) * 100)}% of total` : '0%'} icon={<Target className="h-4 w-4" />} />
      <Stat label="Added to shortlist" value={String(s.shortlisted)} sub={s.found > 0 ? `${Math.round((s.shortlisted / s.found) * 100)}% of total` : '0%'} icon={<Star className="h-4 w-4" />} accent />
    </div>
  );
}

function Stat({ label, value, sub, icon, accent, pulse }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean; pulse?: boolean }) {
  return (
    <div className={(accent ? 'border-evari-gold/30 bg-evari-gold/5 ' : 'border-evari-edge/30 bg-evari-surface ') + 'rounded-md border px-3 py-2.5'}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={(accent ? 'bg-evari-gold/15 text-evari-gold ' : 'bg-evari-ink/40 text-evari-dim ') + 'inline-flex items-center justify-center h-6 w-6 rounded-md'}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</span>
        {pulse ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-evari-success animate-pulse" /> : null}
      </div>
      <div className="text-[18px] font-semibold tabular-nums text-evari-text">{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim">{sub}</div> : null}
    </div>
  );
}
