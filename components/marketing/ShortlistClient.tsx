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
import {
  Avatar,
  CompanyDrawer,
  RowEnrichDot,
  type Row as DrawerRow,
  type StrategyContext,
} from '@/components/discover/DiscoveryDashboard';

interface AboutMeta {
  address?: string | null;
  phone?: string | null;
  employeeRange?: string | null;
  orgType?: string | null;
  generatedAt?: string;
}

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
  aboutText: string | null;
  aboutMeta: AboutMeta | null;
  notes: string | null;
  logoUrl: string | null;
}

type Tab = 'shortlisted' | 'candidates';

interface Props {
  plays: { id: string; title: string }[];
  play: { id: string; title: string };
  initial: Entry[];
}

export function ShortlistClient({ plays, play, initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Entry[]>(initial);
  const [tab, setTab] = useState<Tab>('shortlisted');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Project a Shortlist Entry into the shape the shared CompanyDrawer
  // expects. Fields the drawer doesn't read at this stage (decision
  // makers, data coverage, aboutText/Meta, notes) are stubbed out and
  // the drawer fetches what it needs lazily.
  const drawerRows: DrawerRow[] = items.map((e) => ({
    id: e.id,
    domain: e.domain,
    name: e.name,
    logoUrl: e.logoUrl ?? 'https://logo.clearbit.com/' + e.domain,
    description: e.fitReason,
    industry: e.industry,
    size: e.employees,
    revenue: e.revenue,
    location: e.location,
    fitScore: e.fitScore,
    decisionMakerCount: 0,
    dataCoverage: 0,
    status: e.status,
    // Pull from cached Discovery enrichment so the drawer renders
    // instantly when warmed.
    aboutText: e.aboutText,
    aboutMeta: e.aboutMeta,
    notes: e.notes,
  }));

  async function huntContacts(id: string) {
    setBusy(`hunt:${id}`);
    try {
      const res = await fetch(`/api/shortlist/${play.id}/hunt-contacts`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shortlistId: id }),
      });
      const json = await res.json();
      if (json?.ok) {
        // Optionally route to the enrichment page so the operator can review immediately.
        router.push(`/enrichment?playId=${play.id}`);
      }
    } finally {
      setBusy(null);
    }
  }


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
    let sl = 0, cand = 0;
    for (const e of items) {
      if (e.status === 'shortlisted') sl++;
      else if (e.status === 'candidate') cand++;
    }
    return { shortlisted: sl, candidates: cand };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (tab === 'shortlisted') return e.status === 'shortlisted';
      if (tab === 'candidates') return e.status === 'candidate';
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
      <div className="px-gutter py-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <select
            value={play.id}
            onChange={(e) => router.push(`/shortlist?playId=${e.target.value}`)}
            className="px-2 py-1.5 rounded-panel bg-evari-surface text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
          >
            {plays.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <div className="text-[12px] text-evari-dim ml-2">
            <span className="text-evari-gold tabular-nums">{counts.shortlisted}</span> shortlisted ·
            <span className="text-evari-dim tabular-nums"> {counts.candidates} candidates</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-evari-edge/30">
          {[
            { key: 'shortlisted' as Tab, label: 'Shortlisted', count: counts.shortlisted },
            { key: 'candidates' as Tab, label: 'Candidates', count: counts.candidates },
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
        <div className="rounded-panel bg-evari-surface border border-evari-edge/30 overflow-hidden">
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
                <tr key={e.id} onClick={() => setSelectedId(e.id)} className="border-t border-evari-edge/20 hover:bg-evari-ink/30 cursor-pointer">
                  <td className="py-2 px-3" onClick={(ev) => ev.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="accent-evari-gold" />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={e.name} logoUrl={e.logoUrl ?? 'https://logo.clearbit.com/' + e.domain} />
                      <div>
                        <div className="text-evari-text font-medium flex items-center gap-1.5">
                          {e.name}
                          <RowEnrichDot ready={!!(e.aboutText && e.aboutText.length > 0)} />
                        </div>
                        <div className="text-evari-dim text-[11px]">{e.location ?? e.domain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-evari-dim">{e.industry ?? '—'}</td>
                  <td className="py-2 px-3 text-evari-dim">{e.employees ?? '—'}</td>
                  <td className="py-2 px-3 text-evari-dim">{e.revenue ?? '—'}</td>
                  <td className="py-2 px-3">
                    <FitScoreCell score={e.fitScore} band={e.fitBand} />
                  </td>
                  <td className="py-2 px-3 text-evari-dim max-w-[260px] truncate">{e.fitReason ?? '—'}</td>
                  <td className="py-2 px-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      {e.status === 'shortlisted' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-evari-gold"><Bookmark className="h-3 w-3 fill-evari-gold" /> Shortlisted</span>
                      ) : e.status === 'low_fit' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-evari-dim"><TrendingDown className="h-3 w-3" /> Low fit</span>
                      ) : (
                        <button type="button" onClick={() => { setSelected(new Set([e.id])); void bulkAction('shortlisted'); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-evari-gold/10 text-evari-gold hover:bg-evari-gold/20 transition">
                          <Bookmark className="h-3 w-3" /> Add
                        </button>
                      )}
                      {e.status === 'shortlisted' ? (
                        <button type="button" onClick={() => void huntContacts(e.id)} disabled={busy === `hunt:${e.id}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-evari-text/5 text-evari-text border border-evari-edge/30 hover:border-evari-gold/40 hover:text-evari-gold transition disabled:opacity-50">
                          {busy === `hunt:${e.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Hunt contacts
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Drawer for the selected row */}
        <CompanyDrawer
          row={drawerRows.find((r) => r.id === selectedId) ?? null}
          busy={busy}
          playId={play.id}
          strategyContext={null}
          enrichmentProgress={{ ready: 0, total: 0 }}
          stage="shortlist"
          primaryAction={selectedId ? {
            label: 'Hunt contacts',
            icon: <Sparkles className="h-3.5 w-3.5" />,
            onClick: () => { void huntContacts(selectedId); setSelectedId(null); },
            busy: busy === `hunt:${selectedId}`,
          } : undefined}
          getSeenDomains={() => items.map((e) => e.domain).slice(0, 40)}
          onClose={() => setSelectedId(null)}
          onShortlist={(id) => { setSelected(new Set([id])); void bulkAction('shortlisted'); }}
          onBlock={async (id, domain) => {
            await fetch(`/api/discover/${play.id}/block`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ domain, rowId: id }),
            });
            setItems((cur) => cur.filter((e) => e.id !== id));
            setSelectedId(null);
          }}
          onRowPatched={() => { /* not needed; drawer About/Notes lazy-fetch */ }}
          onPeersAdded={() => { /* not needed; new peers don't auto-add */ }}
        />

        {/* Bulk actions */}
        {selected.size > 0 ? (
          <div className="rounded-panel bg-evari-surface border border-evari-gold/30 px-3 py-2 flex items-center gap-3">
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
