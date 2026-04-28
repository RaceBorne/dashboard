'use client';

/**
 * Discovery dashboard. The default surface at /discover for a play.
 *
 * Top: 5-stat strip (Companies found, Decision makers, Data coverage,
 * Estimated reachable, Avg fit score). Filter row + scored companies
 * table. AI Assistant pane on the right surfaces top industries +
 * recommended actions. Bottom timeline links back to /strategy steps
 * via the shared StrategyTimeline component.
 *
 * The legacy DiscoverClient (search + enrichment streaming) is still
 * mounted at /discover/search for the "find new companies" flow.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, ChevronRight, Filter, Loader2, MoreHorizontal, Pencil, Plus, Save, Search, SlidersHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAISurface } from '@/components/ai/AIAssistantPane';
import { StepTitle } from '@/components/marketing/strategy/StepTitle';

interface Row {
  id: string;
  domain: string;
  name: string;
  industry: string | null;
  size: string | null;
  revenue: string | null;
  location: string | null;
  fitScore: number | null;
  decisionMakerCount: number;
  dataCoverage: number;
  status: string;
}

interface Stats {
  companiesFound: number;
  decisionMakers: number;
  dataCoverage: number;
  estimatedReachable: number;
  avgFitScore: number;
  pctOfDM: number;
}

interface Industry { name: string; count: number; pct: number }

interface Props {
  plays: { id: string; title: string }[];
  play: { id: string; title: string };
}

const PER_PAGE = 25;

export function DiscoveryDashboard({ plays, play }: Props) {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [topIndustries, setTopIndustries] = useState<Industry[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  useAISurface({
    surface: 'discovery',
    scopeId: play.id,
    context: { playTitle: play.title, found: stats?.companiesFound ?? 0, dmReachable: stats?.estimatedReachable ?? 0, topIndustries },
    suggestions: [
      { title: 'Review and shortlist highest fit companies', subtitle: 'Walk top 10 together', prompt: 'Walk me through the 10 highest-fit companies in Discovery. For each: who, why they fit, what to say first.' },
      { title: 'Enrich missing data for top accounts', subtitle: 'Plug coverage gaps', prompt: 'Of the companies in Discovery, which ones are missing the most contact data, and which 5 should I enrich next?' },
      { title: 'Proceed to Shortlist to finalise your target list', subtitle: 'Curate the buy list', prompt: 'I am ready to move on. Suggest the 25 best candidates from Discovery to shortlist, with reasons.' },
    ],
  });

  async function load() {
    const res = await fetch(`/api/discover/${play.id}/dashboard`, { cache: 'no-store' });
    const json = await res.json();
    if (json?.ok) {
      setStats(json.stats);
      setRows(json.rows);
      setTopIndustries(json.topIndustries ?? []);
    } else {
      setRows([]); setStats({ companiesFound: 0, decisionMakers: 0, dataCoverage: 0, estimatedReachable: 0, avgFitScore: 0, pctOfDM: 0 });
    }
  }
  useEffect(() => { void load(); }, [play.id]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.industry ?? '').toLowerCase().includes(q) ||
      (r.location ?? '').toLowerCase().includes(q) ||
      r.domain.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  async function shortlist(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/shortlist/${play.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [id], status: 'shortlisted' }),
      });
      setRows((cur) => cur?.map((r) => r.id === id ? { ...r, status: 'shortlisted' } : r) ?? null);
    } finally { setBusy(null); }
  }

  if (!stats || rows === null) {
    return (
      <div className="flex items-center justify-center py-20 text-evari-dim text-[12px]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading discovery...
      </div>
    );
  }

  return (
    <div className="space-y-panel">
      {/* Header */}
      <header className="flex items-center gap-2">
        <div className="flex-1">
          <StepTitle substep="Discovery" />
          <p className="text-[12px] text-evari-dim">Find and validate companies that match your ideal customer profile.</p>
        </div>
        <select
          value={play.id}
          onChange={(e) => router.push(`/discover?playId=${e.target.value}`)}
          className="px-2 py-1.5 rounded-panel bg-evari-surface text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
        >
          {plays.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <Link href={`/strategy?playId=${encodeURIComponent(play.id)}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit strategy
        </Link>
        <Link href={`/discover/search?playId=${encodeURIComponent(play.id)}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">
          <Plus className="h-3.5 w-3.5" /> Add companies
        </Link>
      </header>

      {/* Stats strip */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Companies found" value={stats.companiesFound.toLocaleString()} sub="100% of target" />
          <Stat label="Decision makers" value={stats.decisionMakers.toLocaleString()} sub="100% of target" />
          <Stat label="Data coverage" value={`${stats.dataCoverage}%`} sub={stats.dataCoverage >= 90 ? 'High quality' : stats.dataCoverage >= 70 ? 'Good' : 'Partial'} />
          <Stat label="Estimated reachable" value={stats.estimatedReachable.toLocaleString()} sub={`${stats.pctOfDM}% of decision makers`} />
          <Stat label="Avg. fit score" value={String(stats.avgFitScore)} sub={stats.avgFitScore >= 80 ? 'Strong fit' : stats.avgFitScore >= 60 ? 'Good fit' : 'Average fit'} accent />
        </div>
      </section>

      {/* Filter row */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-3.5 w-3.5 text-evari-dim absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search companies..."
              className="w-full pl-8 pr-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
            />
          </div>
          <FilterChip label="Industry" value="All" />
          <FilterChip label="Company size" value="—" />
          <FilterChip label="Revenue" value="—" />
          <FilterChip label="Location" value="—" />
          <button type="button" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-dim hover:text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition">
            <Filter className="h-3.5 w-3.5" /> More filters
          </button>
          <button type="button" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-gold border border-evari-gold/30 hover:bg-evari-gold/10 transition">
            <Save className="h-3.5 w-3.5" /> Save view
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-evari-dim">
          <span>{stats.companiesFound.toLocaleString()} companies <button onClick={() => setSearch('')} className="text-evari-gold hover:underline">Clear all</button></span>
          <span className="inline-flex items-center gap-2">
            <button type="button" className="inline-flex items-center gap-1 hover:text-evari-text transition"><SlidersHorizontal className="h-3 w-3" /> Columns</button>
            <span>Sort: <span className="text-evari-text">Fit score</span></span>
          </span>
        </div>
      </section>

      {/* Companies table */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer border-b border-evari-edge/30">
              <th className="text-left py-2.5 px-3 w-[24px]"></th>
              <th className="text-left py-2.5 px-3">Company</th>
              <th className="text-left py-2.5 px-3">Industry</th>
              <th className="text-left py-2.5 px-3">Size</th>
              <th className="text-left py-2.5 px-3">Revenue</th>
              <th className="text-left py-2.5 px-3">Location</th>
              <th className="text-left py-2.5 px-3 w-[140px]">Fit score</th>
              <th className="text-left py-2.5 px-3">Decision makers</th>
              <th className="text-left py-2.5 px-3">Data coverage</th>
              <th className="py-2.5 px-3 w-[24px]"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-evari-dim">No companies in Discovery yet. Click <Link href={`/discover/search?playId=${play.id}`} className="text-evari-gold hover:underline">Add companies</Link> to find some.</td></tr>
            ) : visible.map((r) => (
              <tr key={r.id} className="border-t border-evari-edge/20 hover:bg-evari-ink/30 group">
                <td className="px-3"><input type="checkbox" className="accent-evari-gold" /></td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.name} />
                    <a href={`https://${r.domain}`} target="_blank" rel="noopener" className="text-evari-text font-medium hover:text-evari-gold transition inline-flex items-center gap-1">
                      {r.name} <ChevronRight className="h-3 w-3 -rotate-45 text-evari-dim" />
                    </a>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-evari-dim">{r.industry ?? '—'}</td>
                <td className="py-2.5 px-3 text-evari-dim">{r.size ?? '—'}</td>
                <td className="py-2.5 px-3 text-evari-dim">{r.revenue ?? '—'}</td>
                <td className="py-2.5 px-3 text-evari-dim">{r.location ?? '—'}</td>
                <td className="py-2.5 px-3"><FitScoreCell score={r.fitScore} /></td>
                <td className="py-2.5 px-3 text-evari-text font-mono tabular-nums">{r.decisionMakerCount}</td>
                <td className="py-2.5 px-3 text-evari-text font-mono tabular-nums">{r.dataCoverage}%</td>
                <td className="px-3 text-right">
                  <RowMenu row={r} busy={busy === r.id} onShortlist={() => void shortlist(r.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Pagination */}
      {filtered.length > PER_PAGE ? (
        <footer className="flex items-center justify-between text-[11px] text-evari-dim">
          <span>Showing {(safePage - 1) * PER_PAGE + 1} to {Math.min(safePage * PER_PAGE, filtered.length)} of {filtered.length.toLocaleString()} companies</span>
          <div className="inline-flex items-center gap-1">
            <button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="px-2 py-1 rounded-md hover:bg-evari-surface disabled:opacity-30 transition">‹</button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const p = i + 1;
              return (
                <button key={p} type="button" onClick={() => setPage(p)} className={cn('px-2.5 py-1 rounded-md transition', p === safePage ? 'bg-evari-gold/15 text-evari-gold' : 'hover:bg-evari-surface text-evari-dim')}>
                  {p}
                </button>
              );
            })}
            {totalPages > 5 ? <span className="px-1 text-evari-dimmer">...</span> : null}
            {totalPages > 5 ? <button type="button" onClick={() => setPage(totalPages)} className="px-2.5 py-1 rounded-md hover:bg-evari-surface text-evari-dim transition">{totalPages}</button> : null}
            <button type="button" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)} className="px-2 py-1 rounded-md hover:bg-evari-surface disabled:opacity-30 transition">›</button>
          </div>
          <span>{PER_PAGE} per page</span>
        </footer>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-evari-dim mb-1">{label}</div>
      <div className={cn('text-[26px] font-bold tabular-nums', accent ? 'text-evari-gold' : 'text-evari-text')}>{value}</div>
      {sub ? <div className="text-[11px] text-evari-dim">{sub}</div> : null}
    </div>
  );
}

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-evari-edge/40 bg-evari-ink text-evari-text">
      <span className="text-evari-dim">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function FitScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-evari-dim">—</span>;
  const tone =
    score >= 90 ? 'text-evari-success' :
    score >= 80 ? 'text-evari-gold' :
    score >= 60 ? 'text-evari-text' : 'text-evari-dim';
  return (
    <div className="flex items-center gap-2">
      <span className={cn('font-mono tabular-nums font-semibold', tone)}>{score}</span>
      <div className="h-1 flex-1 rounded-full bg-evari-edge/30 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: tone === 'text-evari-success' ? 'var(--evari-success-fallback, #61C16A)' : '#FEC700' }} />
      </div>
    </div>
  );
}

const AVATAR_PALETTE = ['#7CCFC2', '#4AA39C', '#2F7B7C', '#1F555F', '#C09000', '#A26F00', '#5C8D4F', '#42685B'];

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  let h = 0; for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
  const color = AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
  return (
    <div className="h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: color }}>
      {initials}
    </div>
  );
}

function RowMenu({ row, busy, onShortlist }: { row: Row; busy: boolean; onShortlist: () => void }) {
  if (row.status === 'shortlisted') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-evari-gold"><Bookmark className="h-3 w-3 fill-evari-gold" /> Shortlisted</span>;
  }
  return (
    <button type="button" onClick={onShortlist} disabled={busy} className="text-evari-dim hover:text-evari-gold transition" title="Shortlist this company">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
    </button>
  );
}
