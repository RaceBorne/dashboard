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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { ArrowLeft, Bookmark, ChevronRight, ExternalLink, Loader2, MapPin, MoreHorizontal, Pencil, Plus, Search, Send, Star, Wand2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAISurface } from '@/components/ai/AIAssistantPane';
import { StepTitle } from '@/components/marketing/strategy/StepTitle';

interface Row {
  id: string;
  domain: string;
  name: string;
  logoUrl?: string | null;
  description?: string | null;
  industry: string | null;
  size: string | null;
  revenue: string | null;
  location: string | null;
  fitScore: number | null;
  decisionMakerCount: number;
  dataCoverage: number;
  status: string;
  aboutText?: string | null;
  aboutMeta?: AboutMeta | null;
  notes?: string | null;
}

interface AboutMeta {
  address?: string | null;
  phone?: string | null;
  employeeRange?: string | null;
  orgType?: string | null;
  generatedAt?: string;
}

interface StrategyContext {
  campaignName: string | null;
  objective: string | null;
  industries: string[];
  geographies: string[];
  targetAudience: string[];
  companySizes: string[];
  revenues: string[];
  channels: string[];
  messaging: { angle: string; line?: string }[] | null;
  idealCustomer: string | null;
  synopsisText: string | null;
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
  play: {
    id: string;
    title: string;
    autoScan?: {
      status?: 'pending' | 'running' | 'done' | 'error' | 'skipped';
      error?: string;
      finishedAt?: string;
      description?: string;
    };
  };
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [strategyContext, setStrategyContext] = useState<StrategyContext | null>(null);
  // Set of shortlist row ids we've already kicked off About-prefetch
  // for this session. useRef so writes don't trigger re-renders. Lives
  // for the lifetime of the component, not per-load, so a row that
  // comes back in a polled reload doesn't re-fire if we already kicked
  // off its prefetch the first time.
  const warmedIdsRef = useRef<Set<string>>(new Set<string>());
  // In-flight count so we don't blow the AI rate limit. Capped low and
  // queued, since a fresh shortlist can land 30+ rows at once.
  const aboutQueueRef = useRef<{ inFlight: number; queue: Array<() => Promise<void>> }>({ inFlight: 0, queue: [] });

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
      setStrategyContext(json.strategyContext ?? null);
    } else {
      setRows([]); setStats({ companiesFound: 0, decisionMakers: 0, dataCoverage: 0, estimatedReachable: 0, avgFitScore: 0, pctOfDM: 0 });
    }
  }
  useEffect(() => { void load(); }, [play.id]);

  // Concurrency-bounded queue for About-prefetches. The dispatcher
  // pulls the next job whenever a slot frees. Cap at 3 so a fresh
  // shortlist of 30 rows doesn't fan out into a rate-limit burst.
  const ABOUT_CONCURRENCY = 3;
  const enqueueAboutPrefetch = useCallback((row: Row) => {
    if (warmedIdsRef.current.has(row.id)) return;
    if (row.aboutText && row.aboutText.length > 0) {
      // Already enriched (server returned cached value). Mark warmed so
      // we never re-enqueue, and skip the network call.
      warmedIdsRef.current.add(row.id);
      return;
    }
    warmedIdsRef.current.add(row.id);
    const job = async () => {
      try {
        const res = await fetch(`/api/discover/${play.id}/companies/${row.id}/enrich-about`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        const data = await res.json().catch(() => null);
        if (data?.ok && typeof data.aboutText === 'string') {
          // Patch the local row in place so the drawer sees fresh data
          // without forcing a full dashboard reload (which would burn
          // bandwidth on the polled scan path).
          setRows((cur) => cur?.map((r) => r.id === row.id ? { ...r, aboutText: data.aboutText, aboutMeta: data.aboutMeta ?? null } : r) ?? null);
        }
      } catch {
        // Non-fatal — the user can still trigger a manual enrich from
        // the drawer's About tab if needed.
      } finally {
        aboutQueueRef.current.inFlight--;
        runAboutQueue();
      }
    };
    aboutQueueRef.current.queue.push(job);
    runAboutQueue();
  }, [play.id]);

  function runAboutQueue() {
    while (
      aboutQueueRef.current.inFlight < ABOUT_CONCURRENCY &&
      aboutQueueRef.current.queue.length > 0
    ) {
      const next = aboutQueueRef.current.queue.shift();
      if (!next) break;
      aboutQueueRef.current.inFlight++;
      void next();
    }
  }

  // Whenever rows change (initial load, polled refresh, find-similar
  // returns), enqueue About-prefetch for any row we haven't warmed yet.
  // Buffering kicks in the moment a row lands in the list, not when
  // the user mouses over or clicks it.
  useEffect(() => {
    if (!rows) return;
    for (const r of rows) enqueueAboutPrefetch(r);
  }, [rows, enqueueAboutPrefetch]);

  // Poll while a scan is in flight so candidates appear in real time
  // as the agent inserts them. Triggered by play.autoScan.status =
  // 'running' OR by the just-arrived URL flag, so it works whether the
  // user landed from a commit or just clicked Find companies.
  const searchParamsForPoll = useSearchParams();
  const arrivingFromCommit = searchParamsForPoll?.get('autoScanned') === '1';
  const scanRunning = play.autoScan?.status === 'running' || busy === 'autoscan';
  useEffect(() => {
    if (!arrivingFromCommit && !scanRunning) return;
    if (rows === null) return;
    let cancelled = false;
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      // Cap at 60 polls (3 minutes) so a runaway scan doesn't hammer
      // forever. The agent has a 5-minute lambda timeout but most
      // runs complete in under 90s.
      if (attempts > 60 || cancelled) {
        clearInterval(id);
        return;
      }
      void load();
    }, 3000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivingFromCommit, scanRunning, play.id]);

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

  async function findSimilar(domain: string) {
    setBusy('similar:' + domain);
    try {
      const seenDomains = (rows ?? []).map((r) => r.domain).slice(0, 40);
      await fetch('/api/discover/find-similar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain, playId: play.id, seenDomains, limit: 8 }),
      });
      // Reload the dashboard so the new peer rows show up.
      await load();
    } finally { setBusy(null); }
  }

  // Just-arrived banner — flagged when the user lands here from the
  // Spitball commit. Fades out once the play row reports any
  // candidates, so the user gets a "still searching" message until the
  // first match shows up.
  const searchParams = useSearchParams();
  const justArrived = searchParams?.get('autoScanned') === '1';
  const stillScanning = (justArrived || scanRunning) && rows !== null;

  if (!stats || rows === null) {
    return (
      <div className="flex items-center justify-center py-20 text-evari-dim text-[12px]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading discovery...
      </div>
    );
  }

  return (
    <div className="space-y-panel">
      {(justArrived || stillScanning) && (
        <section className="rounded-panel bg-evari-gold/10 border border-evari-gold/30 px-3 py-2 text-[12px] text-evari-gold flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {scanRunning
            ? `Agent is researching, ${rows.length} ${rows.length === 1 ? 'company' : 'companies'} added so far. New rows appear automatically.`
            : `Strategy locked. ${rows.length} ${rows.length === 1 ? 'candidate' : 'candidates'} found so far.`}
        </section>
      )}
      {/* Header */}
      <header className="flex items-center gap-2">
        <div className="flex-1">
          <StepTitle substep="Discovery" />
          <p className="text-[12px] text-evari-dim">Find and validate companies that match your ideal customer profile.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/ideas')}
          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-panel text-[12px] text-evari-dim hover:text-evari-text hover:bg-evari-surface transition"
          title="Back to Ideas"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Ideas</span>
        </button>
        <span className="text-evari-dimmer text-[12px]">/</span>
        <span className="text-[12px] font-semibold text-evari-text truncate max-w-[280px]" title={play.title}>{play.title}</span>
        <Link href={`/strategy?playId=${encodeURIComponent(play.id)}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit strategy
        </Link>
        <button
          type="button"
          onClick={async () => {
            setBusy('autoscan');
            try {
              await fetch(`/api/plays/${play.id}/discover-agent`, { method: 'POST' });
              await load();
            } finally {
              setBusy(null);
            }
          }}
          disabled={busy === 'autoscan'}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-60 disabled:cursor-wait transition"
        >
          {busy === 'autoscan' ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding companies…</>
          ) : (
            <><Plus className="h-3.5 w-3.5" /> Find companies</>
          )}
        </button>
      </header>

      {/* Auto-scan failure banner. The /api/plays/[id]/auto-scan flow
          writes the error onto play.autoScan when it dies, but
          previously we had no UI for it — Discovery just looked
          empty. Now we show what went wrong and offer a retry. */}
      {play.autoScan?.status === 'error' && play.autoScan.error ? (
        <section className="rounded-panel border border-red-500/40 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-red-500/15 text-red-400 shrink-0 text-[14px] font-bold">!</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-evari-text">Auto-scan failed</div>
              <p className="text-[12px] text-evari-dim mt-0.5 break-words">{play.autoScan.error}</p>
              <p className="text-[11px] text-evari-dimmer mt-2">
                The most common cause is a stale DataForSEO API password. Sign in to <a href="https://app.dataforseo.com/api-access" target="_blank" rel="noreferrer" className="underline text-evari-gold">app.dataforseo.com/api-access</a>, copy the password, and update <code className="px-1 bg-evari-ink rounded">DATAFORSEO_PASSWORD</code> in Vercel. Then click Retry below.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                setBusy('autoscan');
                try {
                  await fetch(`/api/plays/${play.id}/discover-agent`, { method: 'POST' });
                  await load();
                  router.refresh();
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy === 'autoscan'}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-text text-evari-ink hover:brightness-110 disabled:opacity-60 transition shrink-0"
            >
              {busy === 'autoscan' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Retrying…</> : 'Retry scan'}
            </button>
          </div>
        </section>
      ) : null}

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
        </div>
        <div className="flex items-center justify-between text-[11px] text-evari-dim">
          <span>{stats.companiesFound.toLocaleString()} companies <button onClick={() => setSearch('')} className="text-evari-gold hover:underline">Clear all</button></span>
          <span>Sort: <span className="text-evari-text">Fit score</span></span>
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
              <tr><td colSpan={10} className="text-center py-12 text-evari-dim">No companies in Discovery yet. Use the Find companies button above to run an auto-scan.</td></tr>
            ) : visible.map((r) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)} className="border-t border-evari-edge/20 hover:bg-evari-ink/30 group cursor-pointer">
                <td className="px-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-evari-gold" /></td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.name} logoUrl={r.logoUrl} />
                    <span className="text-evari-text font-medium">{r.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-evari-dim">{r.industry ?? '—'}</td>
                <td className="py-2.5 px-3 text-evari-dim">{r.size ?? '—'}</td>
                <td className="py-2.5 px-3 text-evari-dim">{r.revenue ?? '—'}</td>
                <td className="py-2.5 px-3 text-evari-dim">{r.location ?? '—'}</td>
                <td className="py-2.5 px-3"><FitScoreCell score={r.fitScore} /></td>
                <td className="py-2.5 px-3 text-evari-text font-mono tabular-nums">{r.decisionMakerCount}</td>
                <td className="py-2.5 px-3 text-evari-text font-mono tabular-nums">{r.dataCoverage}%</td>
                <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <RowMenu row={r} busy={busy} onShortlist={() => void shortlist(r.id)} onFindSimilar={() => void findSimilar(r.domain)} />
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
      <CompanyDrawer
        row={visible.find((r) => r.id === selectedId) ?? rows?.find((r) => r.id === selectedId) ?? null}
        busy={busy}
        playId={play.id}
        strategyContext={strategyContext}
        getSeenDomains={() => (rows ?? []).map((r) => r.domain).slice(0, 40)}
        onClose={() => setSelectedId(null)}
        onShortlist={(id) => void shortlist(id)}
        onRowPatched={(id, patch) => setRows((cur) => cur?.map((r) => r.id === id ? { ...r, ...patch } : r) ?? null)}
        onPeersAdded={() => void load()}
      />

    </div>
  );
}

function BannerStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] text-evari-gold/60">{label}</div>
      <div className="text-[14px] font-bold text-evari-gold tabular-nums">{value}</div>
      {sub ? <div className="text-[10px] text-evari-gold/70">{sub}</div> : null}
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

function Avatar({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const initials = name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  let h = 0; for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
  const color = AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
  // Try the Clearbit logo; if it 404s, drop back to initials so the
  // row never breaks.
  if (logoUrl && !logoFailed) {
    return (
      <div className="h-7 w-7 rounded-md overflow-hidden bg-white shrink-0 flex items-center justify-center border border-evari-edge/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={name}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
      </div>
    );
  }
  return (
    <div className="h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: color }}>
      {initials}
    </div>
  );
}

function RowMenu({ row, busy, onShortlist, onFindSimilar }: { row: Row; busy: string | null; onShortlist: () => void; onFindSimilar: () => void }) {
  const shortlistBusy = busy === row.id;
  const similarBusy = busy === 'similar:' + row.domain;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onFindSimilar}
        disabled={similarBusy || shortlistBusy}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-evari-gold hover:bg-evari-gold/10 disabled:opacity-50 transition"
        title="Find peer companies at the same tier and brand ethos"
      >
        {similarBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
        Similar
      </button>
      {row.status === 'shortlisted' ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-evari-gold">
          <Bookmark className="h-3 w-3 fill-evari-gold" /> Shortlisted
        </span>
      ) : (
        <ShortlistButton busy={shortlistBusy} onShortlist={onShortlist} />
      )}
    </span>
  );
}

function ShortlistButton({ busy, onShortlist }: { busy: boolean; onShortlist: () => void }) {
  return (
    <button type="button" onClick={onShortlist} disabled={busy} className="text-evari-dim hover:text-evari-gold transition" title="Shortlist this company">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
    </button>
  );
}

interface SimilarPeer {
  domain: string;
  name: string;
  why: string;
  logoUrl: string;
  rowId: string | null;
  status: string;
}

interface SimilarCacheEntry {
  peers: SimilarPeer[];
  reasoning: string;
  promotedIds: Set<string>;
}

function CompanyDrawer({ row, busy, playId, strategyContext, getSeenDomains, onClose, onShortlist, onRowPatched, onPeersAdded }: {
  row: Row | null;
  busy: string | null;
  playId: string;
  strategyContext: StrategyContext | null;
  getSeenDomains: () => string[];
  onClose: () => void;
  onShortlist: (id: string) => void;
  onRowPatched: (id: string, patch: Partial<Row>) => void;
  onPeersAdded: () => void;
}) {
  type DrawerTabKey = 'about' | 'snapshot' | 'similar' | 'notes' | 'strategy';
  const [tab, setTab] = useState<DrawerTabKey>('about');
  const [similarCache, setSimilarCache] = useState<Record<string, SimilarCacheEntry>>({});
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [snapshotKey, setSnapshotKey] = useState(0);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutError, setAboutError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when the row changes.
  useEffect(() => {
    setTab('about');
    setSnapshotKey((k) => k + 1);
    setSnapshotFailed(false);
    setSimilarError(null);
    setAboutError(null);
    setNotesDraft(row?.notes ?? '');
    setNotesSaving('idle');
  }, [row?.id, row?.notes]);

  // Lazy-fetch the About paragraph if the prefetch hasn't already
  // populated it. Most rows arrive with aboutText already filled in
  // because the dashboard fires enrich-about on row arrival.
  useEffect(() => {
    if (!row) return;
    if (tab !== 'about') return;
    if (row.aboutText && row.aboutText.length > 0) return;
    if (aboutLoading) return;
    let cancelled = false;
    setAboutLoading(true);
    setAboutError(null);
    (async () => {
      try {
        const res = await fetch(`/api/discover/${playId}/companies/${row.id}/enrich-about`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!data?.ok) throw new Error(data?.error ?? 'About enrichment failed');
        onRowPatched(row.id, { aboutText: data.aboutText, aboutMeta: data.aboutMeta ?? null });
      } catch (err) {
        if (!cancelled) setAboutError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setAboutLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, tab, row?.aboutText]);

  // Lazy-fetch peers the first time Similar opens for a given row.
  useEffect(() => {
    if (!row) return;
    if (tab !== 'similar') return;
    if (similarCache[row.domain]) return;
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarError(null);
    (async () => {
      try {
        const res = await fetch('/api/discover/find-similar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            domain: row.domain,
            playId,
            seenDomains: getSeenDomains(),
            limit: 8,
          }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!data?.ok) throw new Error(data?.error ?? 'Find similar failed');
        const peers = (data.peers ?? []) as SimilarPeer[];
        setSimilarCache((cur) => ({
          ...cur,
          [row.domain]: { peers, reasoning: data.reasoning ?? '', promotedIds: new Set() },
        }));
        if ((data.inserted ?? 0) > 0) onPeersAdded();
      } catch (err) {
        if (!cancelled) setSimilarError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, tab]);

  // Debounced notes save. Drops a PATCH 600ms after the user stops
  // typing so we don't hammer Supabase on every keystroke.
  useEffect(() => {
    if (!row) return;
    if (notesDraft === (row.notes ?? '')) return;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      void (async () => {
        setNotesSaving('saving');
        try {
          await fetch(`/api/discover/${playId}/companies/${row.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ notes: notesDraft }),
          });
          onRowPatched(row.id, { notes: notesDraft });
          setNotesSaving('saved');
          setTimeout(() => setNotesSaving('idle'), 1500);
        } catch {
          setNotesSaving('idle');
        }
      })();
    }, 600);
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, [notesDraft, row?.id, row?.notes, playId, onRowPatched]);

  if (!row) return null;
  const shortlisted = row.status === 'shortlisted';
  const shortlistBusy = busy === row.id;
  const websiteUrl = 'https://' + row.domain;
  const cached = similarCache[row.domain];
  const screenshotSrc =
    'https://api.microlink.io/?url=' +
    encodeURIComponent(websiteUrl) +
    '&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800';

  async function promotePeer(peer: SimilarPeer) {
    if (!peer.rowId || !cached) return;
    if (cached.promotedIds.has(peer.rowId)) return;
    try {
      await fetch('/api/shortlist/' + playId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [peer.rowId], status: 'shortlisted' }),
      });
      setSimilarCache((cur) => {
        const entry = cur[row!.domain];
        if (!entry || !peer.rowId) return cur;
        const promotedIds = new Set(entry.promotedIds);
        promotedIds.add(peer.rowId);
        return { ...cur, [row!.domain]: { ...entry, promotedIds } };
      });
      onPeersAdded();
    } catch {
      // Non-fatal; user can retry.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-evari-surface border-l border-evari-edge/30 shadow-2xl flex flex-col h-full"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-evari-edge/30 shrink-0">
          <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Company</span>
          <button
            type="button"
            onClick={onClose}
            className="text-evari-dim hover:text-evari-text transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Overview block stays at the top of the drawer. */}
          <div className="p-4 space-y-4 border-b border-evari-edge/20">
            <div className="flex items-start gap-3">
              <Avatar name={row.name} logoUrl={row.logoUrl} />
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-semibold text-evari-text leading-tight">{row.name}</h2>
                <a href={websiteUrl} target="_blank" rel="noopener" className="text-[12px] text-evari-gold hover:underline inline-flex items-center gap-1 mt-0.5">
                  {row.domain} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {row.description ? (
              <section>
                <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Why this matches</div>
                <p className="text-[13px] text-evari-text leading-relaxed">{row.description}</p>
              </section>
            ) : null}

            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <KV label="Industry" value={row.industry} />
              <KV label="Location" value={row.location} icon={<MapPin className="h-3 w-3" />} />
              <KV label="Size" value={row.size} />
              <KV label="Revenue" value={row.revenue} />
            </div>

            <section>
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Fit score</div>
              <div className="flex items-center gap-3">
                <span className={cn('text-[24px] font-bold tabular-nums',
                  (row.fitScore ?? 0) >= 90 ? 'text-evari-success' :
                  (row.fitScore ?? 0) >= 80 ? 'text-evari-gold' :
                  'text-evari-text')}>{row.fitScore ?? '—'}</span>
                <div className="flex-1 h-1.5 rounded-full bg-evari-edge/30 overflow-hidden">
                  <div className="h-full rounded-full bg-evari-gold transition-all" style={{ width: (row.fitScore ?? 0) + '%' }} />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 text-[12px]">
              <KV label="Decision makers" value={String(row.decisionMakerCount)} />
              <KV label="Data coverage" value={row.dataCoverage + '%'} />
            </section>
          </div>

          {/* Five tabs sit inside the drawer below the overview. */}
          <div className="sticky top-0 bg-evari-surface z-10 flex items-center gap-1 px-3 pt-3 pb-0 border-b border-evari-edge/30 overflow-x-auto">
            <DrawerTab label="About" active={tab === 'about'} onClick={() => setTab('about')} />
            <DrawerTab label="Snapshot" active={tab === 'snapshot'} onClick={() => setTab('snapshot')} />
            <DrawerTab label="Similar" active={tab === 'similar'} onClick={() => setTab('similar')} />
            <DrawerTab label="Notes" active={tab === 'notes'} onClick={() => setTab('notes')} />
            <DrawerTab label="Strategy" active={tab === 'strategy'} onClick={() => setTab('strategy')} />
          </div>

          {tab === 'about' ? (
            <div className="p-4 space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5">About</div>
                {row.aboutText ? (
                  <p className="text-[13px] text-evari-text leading-relaxed whitespace-pre-line">{row.aboutText}</p>
                ) : aboutLoading ? (
                  <div className="text-[11px] text-evari-dim flex items-center gap-2 py-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Researching the company on the open web...
                  </div>
                ) : aboutError ? (
                  <div className="text-[11px] text-evari-dim border border-evari-edge/30 rounded-md p-3 bg-evari-edge/10">
                    Could not generate the About paragraph: {aboutError}
                  </div>
                ) : (
                  <div className="text-[11px] text-evari-dim">No About data yet. Switching to this tab will trigger a research pass.</div>
                )}
              </div>

              {row.aboutMeta && (row.aboutMeta.address || row.aboutMeta.phone || row.aboutMeta.employeeRange || row.aboutMeta.orgType) ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5">Company details</div>
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    {row.aboutMeta.address ? <KV label="Address" value={row.aboutMeta.address} icon={<MapPin className="h-3 w-3" />} /> : null}
                    {row.aboutMeta.phone ? <KV label="Phone" value={row.aboutMeta.phone} /> : null}
                    {row.aboutMeta.employeeRange ? <KV label="Employees" value={row.aboutMeta.employeeRange} /> : null}
                    {row.aboutMeta.orgType ? <KV label="Org type" value={row.aboutMeta.orgType} /> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'snapshot' ? (
            <div className="p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer flex items-center justify-between">
                <span>Live screenshot</span>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-[10px] uppercase tracking-[0.12em] text-evari-gold hover:underline inline-flex items-center gap-1"
                >
                  Open site <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="rounded-md border border-evari-edge/30 bg-evari-edge/10 overflow-hidden aspect-[16/10] flex items-center justify-center">
                {snapshotFailed ? (
                  <div className="text-[11px] text-evari-dim text-center px-6">
                    Could not load a screenshot for this site. Use Open site to inspect it directly.
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={snapshotKey + ':' + row.domain}
                    src={screenshotSrc}
                    alt={row.name + ' homepage'}
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                    onError={() => setSnapshotFailed(true)}
                  />
                )}
              </div>
              <div className="text-[10px] text-evari-dimmer leading-relaxed">
                Quick gut-check that the company is real, on-brand and the right size of operation. Snapshot is generated on demand by Microlink.
              </div>
            </div>
          ) : null}

          {tab === 'similar' ? (
            <div className="p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer flex items-center justify-between">
                <span>Peer companies at the same tier</span>
                {cached?.peers?.length ? (
                  <span className="text-[10px] text-evari-dimmer normal-case tracking-normal">{cached.peers.length} found, all added to your list</span>
                ) : null}
              </div>
              {similarLoading ? (
                <div className="text-[11px] text-evari-dim flex items-center gap-2 py-6">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching the web for peer brands at the same tier as {row.name}...
                </div>
              ) : null}
              {similarError ? (
                <div className="text-[11px] text-evari-dim border border-evari-edge/30 rounded-md p-3 bg-evari-edge/10">
                  Could not run Find similar: {similarError}
                </div>
              ) : null}
              {!similarLoading && !similarError && cached?.peers?.length === 0 ? (
                <div className="text-[11px] text-evari-dim py-6 text-center">
                  The agent could not pin down peers for this company. Try a richer reference (more fields filled in on the row), or run it again later.
                </div>
              ) : null}
              {!similarLoading && cached?.reasoning ? (
                <div className="text-[10px] text-evari-dimmer italic leading-relaxed">{cached.reasoning}</div>
              ) : null}
              {cached?.peers?.map((peer) => {
                const peerShortlisted = peer.status === 'shortlisted' || (peer.rowId ? cached.promotedIds.has(peer.rowId) : false);
                const peerWebsite = 'https://' + peer.domain;
                return (
                  <div key={peer.domain} className="flex items-start gap-3 rounded-md border border-evari-edge/30 p-3 bg-evari-edge/5">
                    <Avatar name={peer.name} logoUrl={peer.logoUrl} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-evari-text leading-tight truncate">{peer.name}</div>
                        {peerShortlisted ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-evari-gold whitespace-nowrap">
                            <Star className="h-3 w-3 fill-evari-gold" /> Shortlisted
                          </span>
                        ) : peer.rowId ? (
                          <button
                            type="button"
                            onClick={() => void promotePeer(peer)}
                            className="inline-flex items-center gap-1 text-[10px] text-evari-gold hover:underline whitespace-nowrap"
                          >
                            <Send className="h-3 w-3" /> Shortlist
                          </button>
                        ) : null}
                      </div>
                      <a
                        href={peerWebsite}
                        target="_blank"
                        rel="noopener"
                        className="text-[11px] text-evari-gold hover:underline inline-flex items-center gap-1"
                      >
                        {peer.domain} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      {peer.why ? (
                        <p className="text-[11px] text-evari-dim leading-relaxed mt-1">{peer.why}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'notes' ? (
            <div className="p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer flex items-center justify-between">
                <span>Notes for this company</span>
                <span className="text-[10px] text-evari-dimmer normal-case tracking-normal">
                  {notesSaving === 'saving' ? 'Saving...' : notesSaving === 'saved' ? 'Saved' : ''}
                </span>
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Anything worth remembering about this prospect: how you found them, who introduced you, why they fit, what to lead the conversation with..."
                className="w-full min-h-[180px] rounded-md border border-evari-edge/30 bg-evari-edge/5 p-3 text-[13px] text-evari-text leading-relaxed placeholder:text-evari-dimmer focus:outline-none focus:border-evari-gold/50 resize-y"
              />
              <div className="text-[10px] text-evari-dimmer">Notes persist with this row through Shortlist + Enrichment.</div>
            </div>
          ) : null}

          {tab === 'strategy' ? (
            <div className="p-4 space-y-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Why this row fits the brief</div>
              {strategyContext ? (
                <div className="space-y-3 text-[12px]">
                  {strategyContext.campaignName ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Campaign</div>
                      <div className="text-[12px] text-evari-text">{strategyContext.campaignName}</div>
                    </div>
                  ) : null}
                  {strategyContext.objective ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Objective</div>
                      <div className="text-[12px] text-evari-text leading-relaxed">{strategyContext.objective}</div>
                    </div>
                  ) : null}
                  {strategyContext.idealCustomer ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Ideal customer</div>
                      <div className="text-[12px] text-evari-text leading-relaxed">{strategyContext.idealCustomer}</div>
                    </div>
                  ) : null}
                  {strategyContext.industries.length > 0 ? <ChipRow label="Industries" values={strategyContext.industries} /> : null}
                  {strategyContext.geographies.length > 0 ? <ChipRow label="Geographies" values={strategyContext.geographies} /> : null}
                  {strategyContext.targetAudience.length > 0 ? <ChipRow label="Target audience" values={strategyContext.targetAudience} /> : null}
                  {strategyContext.companySizes.length > 0 ? <ChipRow label="Company sizes" values={strategyContext.companySizes} /> : null}
                  {strategyContext.revenues.length > 0 ? <ChipRow label="Revenue bands" values={strategyContext.revenues} /> : null}
                  {strategyContext.channels.length > 0 ? <ChipRow label="Channels" values={strategyContext.channels} /> : null}
                  {strategyContext.messaging && strategyContext.messaging.length > 0 ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Key messages</div>
                      <ul className="space-y-1.5">
                        {strategyContext.messaging.map((m, i) => (
                          <li key={i} className="text-[12px] text-evari-text leading-relaxed">
                            <span className="text-evari-gold">{m.angle}</span>
                            {m.line ? <span className="text-evari-dim">, {m.line}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-[11px] text-evari-dim">No strategy brief on file for this venture yet.</div>
              )}
            </div>
          ) : null}
        </div>

        <footer className="px-4 py-3 border-t border-evari-edge/30 flex items-center gap-2 shrink-0">
          {shortlisted ? (
            <span className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold border border-evari-gold/30 flex-1">
              <Star className="h-3.5 w-3.5 fill-evari-gold" /> Already shortlisted
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onShortlist(row.id)}
              disabled={shortlistBusy}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition flex-1"
            >
              {shortlistBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send to shortlist
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function DrawerTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-2 text-[12px] font-medium border-b-2 transition whitespace-nowrap',
        active
          ? 'border-evari-gold text-evari-gold'
          : 'border-transparent text-evari-dim hover:text-evari-text',
      )}
    >
      {label}
    </button>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-full bg-evari-edge/20 text-[11px] text-evari-text border border-evari-edge/30">{v}</span>
        ))}
      </div>
    </div>
  );
}

function KV({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5 inline-flex items-center gap-1">{icon}{label}</div>
      <div className="text-[12px] text-evari-text leading-snug">{value && value.length > 0 ? value : '—'}</div>
    </div>
  );
}
