'use client';

/**
 * Shortlist curation surface for one idea (play).
 *
 * Tabs (All / High fit / Medium fit / Low fit / Shortlisted) over
 * a single candidate list. Bulk Shortlist / Move to low fit / Remove
 * actions in the footer. Right rail offers AI scoring criteria via
 * the AIPane suggestions.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bookmark,
  CheckCircle2,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  TrendingDown,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAISurface } from '@/components/ai/AIAssistantPane';

interface Entry {
  id: string;
  playId: string;
  domain: string;
  name: string;
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  location: string | null;
  description: string | null;
  fitScore: number | null;
  fitBand: string | null;
  fitReason: string | null;
  status: 'candidate' | 'shortlisted' | 'low_fit' | 'removed';
  addedAt: string;
}

type Tab = 'all' | 'high' | 'medium' | 'low' | 'shortlisted';

interface Props {
  plays: { id: string; title: string }[];
  play: { id: string; title: string };
  initial: Entry[];
}

export function ShortlistClient({ plays, play, initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Entry[]>(initial);
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useAISurface({
    surface: 'shortlist',
    scopeId: play.id,
    context: { playTitle: play.title, count: items.length },
    suggestions: [
      { title: 'Prioritise for me', subtitle: 'AI ranks by best fit', prompt: 'Look at the shortlist for this idea and tell me which 3 candidates I should focus on first, and why.' },
      { title: 'Review together', subtitle: 'Go through top matches', prompt: 'Walk me through the top 5 candidates one at a time, with what to like and what to watch.' },
      { title: 'Apply scoring rules', subtitle: 'Use my custom criteria', prompt: 'Based on the current scoring rubric, are there any obvious fixes I should make to the criteria so the rankings improve?' },
    ],
  });

  const counts = useMemo(() => {
    let high = 0, med = 0, low = 0, sl = 0;
    for (const e of items) {
      const sc = e.fitScore ?? 0;
      if (sc >= 80) high++;
      else if (sc >= 60) med++;
      else low++;
      if (e.status === 'shortlisted') sl++;
    }
    return { all: items.length, high, medium: med, low, shortlisted: sl };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((e) => {
      const sc = e.fitScore ?? 0;
      if (tab === 'all') return true;
      if (tab === 'shortlisted') return e.status === 'shortlisted';
      if (tab === 'high') return sc >= 80;
      if (tab === 'medium') return sc >= 60 && sc < 80;
      if (tab === 'low') return sc < 60;
      return true;
    });
  }, [items, tab]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  }

  async function bulkAction(action: 'shortlisted' | 'low_fit' | 'remove') {
    if (selected.size === 0) return;
    setBusy(action);
    try {
      const ids = Array.from(selected);
      if (action === 'remove') {
        await fetch(`/api/shortlist/${play.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
        setItems((cur) => cur.filter((e) => !selected.has(e.id)));
      } else {
        await fetch(`/api/shortlist/${play.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, status: action }) });
        setItems((cur) => cur.map((e) => selected.has(e.id) ? { ...e, status: action } : e));
      }
      setSelected(new Set());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <select
            value={play.id}
            onChange={(e) => router.push(`/shortlist?playId=${e.target.value}`)}
            className="px-2 py-1.5 rounded-md bg-evari-surface text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
          >
            {plays.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <div className="text-[12px] text-evari-dim ml-2">
            <strong className="text-evari-text">{counts.all}</strong> candidates ·
            <span className="text-evari-success"> {counts.high} high</span> ·
            <span> {counts.medium} medium</span> ·
            <span className="text-evari-dim"> {counts.low} low</span> ·
            <span className="text-evari-gold"> {counts.shortlisted} shortlisted</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-evari-edge/30">
          {[
            { key: 'all' as Tab, label: 'All matches', count: counts.all },
            { key: 'high' as Tab, label: 'High fit', count: counts.high },
            { key: 'medium' as Tab, label: 'Medium fit', count: counts.medium },
            { key: 'low' as Tab, label: 'Low fit', count: counts.low },
            { key: 'shortlisted' as Tab, label: 'Shortlisted', count: counts.shortlisted },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition',
                tab === t.key ? 'border-evari-gold text-evari-text' : 'border-transparent text-evari-dim hover:text-evari-text')}
            >
              {t.label}
              <span className={cn('inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded text-[10px] font-mono tabular-nums',
                tab === t.key ? 'bg-evari-gold/15 text-evari-gold' : 'bg-evari-ink/40 text-evari-dim')}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-md bg-evari-surface border border-evari-edge/30 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer border-b border-evari-edge/30">
                <th className="text-left py-2 px-3 w-[24px]">
                  <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={selectAll} className="accent-evari-gold" />
                </th>
                <th className="text-left py-2 px-3">Company</th>
                <th className="text-left py-2 px-3">Industry</th>
                <th className="text-left py-2 px-3">Employees</th>
                <th className="text-left py-2 px-3">Revenue</th>
                <th className="text-left py-2 px-3">Fit score</th>
                <th className="text-left py-2 px-3">Reason</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-evari-dim">No candidates in this bucket.</td></tr>
              ) : filtered.map((e) => (
                <tr key={e.id} className="border-t border-evari-edge/20 hover:bg-evari-ink/30">
                  <td className="py-2 px-3">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="accent-evari-gold" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="text-evari-text font-medium">{e.name}</div>
                    <div className="text-evari-dim text-[11px]">{e.location ?? e.domain}</div>
                  </td>
                  <td className="py-2 px-3 text-evari-dim">{e.industry ?? '—'}</td>
                  <td className="py-2 px-3 text-evari-dim">{e.employees ?? '—'}</td>
                  <td className="py-2 px-3 text-evari-dim">{e.revenue ?? '—'}</td>
                  <td className="py-2 px-3">
                    <FitScoreCell score={e.fitScore} band={e.fitBand} />
                  </td>
                  <td className="py-2 px-3 text-evari-dim max-w-[260px] truncate">{e.fitReason ?? '—'}</td>
                  <td className="py-2 px-3">
                    {e.status === 'shortlisted' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-evari-gold"><Bookmark className="h-3 w-3 fill-evari-gold" /> Shortlisted</span>
                    ) : e.status === 'low_fit' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-evari-dim"><TrendingDown className="h-3 w-3" /> Low fit</span>
                    ) : (
                      <button type="button" onClick={() => { setSelected(new Set([e.id])); void bulkAction('shortlisted'); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-evari-gold/10 text-evari-gold hover:bg-evari-gold/20 transition">
                        <Bookmark className="h-3 w-3" /> Add
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 ? (
          <div className="rounded-md bg-evari-surface border border-evari-gold/30 px-3 py-2 flex items-center gap-3">
            <span className="text-[12px] text-evari-text font-semibold">{selected.size} selected</span>
            <button type="button" onClick={() => void bulkAction('shortlisted')} disabled={busy === 'shortlisted'} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition">
              {busy === 'shortlisted' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Shortlist
            </button>
            <button type="button" onClick={() => void bulkAction('low_fit')} disabled={busy === 'low_fit'} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-dim hover:text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition disabled:opacity-50">
              {busy === 'low_fit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingDown className="h-3.5 w-3.5" />} Move to low fit
            </button>
            <button type="button" onClick={() => void bulkAction('remove')} disabled={busy === 'remove'} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-dim hover:text-evari-danger transition disabled:opacity-50">
              {busy === 'remove' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FitScoreCell({ score, band }: { score: number | null; band: string | null }) {
  if (score === null) return <span className="text-evari-dim">—</span>;
  const tone =
    score >= 90 ? 'text-evari-success' :
    score >= 80 ? 'text-evari-gold' :
    score >= 60 ? 'text-evari-text' :
    'text-evari-dim';
  return (
    <div>
      <div className={cn('font-mono tabular-nums font-semibold', tone)}>{score}</div>
      <div className="text-[10px] text-evari-dim">{band ? band.replace('_', ' ') : ''}</div>
    </div>
  );
}
