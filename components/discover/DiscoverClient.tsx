'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  BadgeCheck,
  Check,
  Loader2,
  Search,
  Sparkles,
  Users2,
  MapPin,
  Mail,
  Send,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyPanel } from '@/components/discover/CompanyPanel';
import { DiscoverFilters } from '@/components/discover/DiscoverFilters';
import type {
  DiscoverCard,
  DiscoveredCompany,
  DiscoverFilters as DiscoverFiltersType,
} from '@/lib/types';

interface PlayOption {
  id: string;
  title: string;
  category?: string;
}

interface Props {
  plays: PlayOption[];
}

const EMPTY_FILTERS: DiscoverFiltersType = {
  location: { include: [], exclude: [] },
  industry: { include: [], exclude: [] },
  keywords: { include: [], exclude: [] },
  companyName: { include: [], exclude: [] },
  companyType: { include: [], exclude: [] },
  similarTo: [],
  sizeBands: [],
  technologies: [],
  savedOnly: false,
};

export function DiscoverClient({ plays }: Props) {
  const [filters, setFilters] = useState<DiscoverFiltersType>(EMPTY_FILTERS);
  const [aiBusy, setAiBusy] = useState(false);

  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [source, setSource] = useState<'dfs' | 'cache' | 'mixed' | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [companyByDomain, setCompanyByDomain] = useState<Map<string, DiscoveredCompany | null>>(new Map());
  const [enrichingDomain, setEnrichingDomain] = useState<string | null>(null);
  const [enrichLog, setEnrichLog] = useState<string[]>([]);

  // Email picker state per-domain
  const [emailPicksByDomain, setEmailPicksByDomain] = useState<Map<string, Set<string>>>(new Map());

  // Send-to-prospects state
  const [playId, setPlayId] = useState<string>(plays[0]?.id ?? '');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ created: number; skipped: number } | null>(null);

  const filtersSummary = useMemo(() => summariseFilters(filters), [filters]);

  // Run search on first mount so the page paints with the cache instead of blank
  useEffect(() => {
    void doSearch(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = useCallback(async (f: DiscoverFiltersType) => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/discover/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filters: f, limit: 100 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        companies?: DiscoverCard[];
        source?: 'dfs' | 'cache' | 'mixed';
        error?: string;
      };
      if (!data.ok) throw new Error(data.error ?? 'Search failed');
      setCards(data.companies ?? []);
      setSource(data.source ?? null);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, []);

  // AI-refine: ask Claude to transform filters, then search
  async function handleAiRefine(prompt: string) {
    setAiBusy(true);
    try {
      const res = await fetch('/api/discover/ai-refine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filters, prompt }),
      });
      const data = (await res.json()) as { ok?: boolean; filters?: DiscoverFiltersType };
      if (data.ok && data.filters) {
        const next = { ...EMPTY_FILTERS, ...data.filters };
        setFilters(next);
        await doSearch(next);
      }
    } finally {
      setAiBusy(false);
    }
  }

  // Enrich one domain via SSE
  async function enrich(domain: string, opts: { force?: boolean } = {}) {
    setEnrichingDomain(domain);
    setEnrichLog([]);
    try {
      const url = `/api/discover/enrich/${encodeURIComponent(domain)}${
        opts.force ? '?force=1' : ''
      }`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const payload = JSON.parse(line.slice(6)) as {
                phase?: string;
                message?: string;
                url?: string;
                query?: string;
                hits?: number;
                company?: DiscoveredCompany;
              };
              const phase = payload.phase ?? '';
              if (phase === 'fetching' && payload.url) {
                setEnrichLog((l) => [...l, 'fetch ' + payload.url]);
              } else if (phase === 'searching' && payload.query) {
                setEnrichLog((l) => [...l, 'search "' + payload.query + '"']);
              } else if (phase === 'search-done') {
                setEnrichLog((l) => [...l, '  → ' + (payload.hits ?? 0) + ' hits']);
              } else if (phase === 'synth') {
                setEnrichLog((l) => [...l, 'synthesising…']);
              } else if (phase === 'error' && payload.message) {
                setEnrichLog((l) => [...l, 'error: ' + payload.message]);
              }
              if (phase === 'done' && payload.company) {
                const co = payload.company;
                setCompanyByDomain((m) => new Map(m).set(domain, co));
                setCards((prev) =>
                  prev.map((c) =>
                    c.domain === domain
                      ? {
                          ...c,
                          name: co.name ?? c.name,
                          logoUrl: co.logoUrl ?? c.logoUrl,
                          category: co.category ?? c.category,
                          employeeBand: co.employeeBand ?? c.employeeBand,
                          hqLabel: co.hq?.full ?? c.hqLabel,
                          enriched: true,
                          emailCount: co.emails?.length ?? c.emailCount,
                        }
                      : c,
                  ),
                );
              }
            } catch {
              /* ignore bad chunk */
            }
          }
        }
      }
    } finally {
      setEnrichingDomain(null);
    }
  }

  // Load a cached company payload when selecting a new card (fast path)
  async function selectCard(domain: string) {
    setSelected(domain);
    if (companyByDomain.has(domain)) return;
    // Opportunistically call the same endpoint with cache-only heuristic: the
    // route will short-circuit within 30 days, streaming a single 'done' event.
    void enrich(domain, { force: false });
  }

  function toggleEmailPick(domain: string, email: string) {
    setEmailPicksByDomain((m) => {
      const next = new Map(m);
      const set = new Set(next.get(domain) ?? []);
      if (set.has(email)) set.delete(email);
      else set.add(email);
      next.set(domain, set);
      return next;
    });
  }
  function setAllEmailPicks(domain: string, emails: string[], on: boolean) {
    setEmailPicksByDomain((m) => {
      const next = new Map(m);
      next.set(domain, new Set(on ? emails : []));
      return next;
    });
  }

  const totalPicked = useMemo(() => {
    let n = 0;
    for (const set of emailPicksByDomain.values()) n += set.size;
    return n;
  }, [emailPicksByDomain]);

  async function sendToProspects() {
    if (!playId || totalPicked === 0) return;
    setSending(true);
    setSendResult(null);
    try {
      const picks = Array.from(emailPicksByDomain.entries())
        .map(([domain, set]) => ({ domain, emails: Array.from(set) }))
        .filter((p) => p.emails.length > 0);
      const res = await fetch('/api/discover/send-to-prospects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playId, picks }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: number;
        skipped?: number;
      };
      if (data.ok) {
        setSendResult({ created: data.created ?? 0, skipped: data.skipped ?? 0 });
        setEmailPicksByDomain(new Map());
        // poke the sidebar counts
        window.dispatchEvent(new Event('evari:nav-counts-dirty'));
      }
    } finally {
      setSending(false);
    }
  }

  const selectedCompany = selected ? companyByDomain.get(selected) ?? null : null;
  const selectedPicks = selected ? emailPicksByDomain.get(selected) ?? new Set<string>() : new Set<string>();
  const selectedEmails = (selectedCompany?.emails ?? []).map((e) => e.address);

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left: filters */}
      <aside className="w-[280px] shrink-0 border-r border-evari-line/40 bg-evari-surface overflow-hidden">
        <DiscoverFilters
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            void doSearch(next);
          }}
          onAiRefine={handleAiRefine}
          aiBusy={aiBusy}
        />
      </aside>

      {/* Middle: results */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="h-12 shrink-0 border-b border-evari-line/40 bg-evari-surface px-4 flex items-center gap-3">
          <div className="flex items-center gap-2 text-[12px] text-evari-dim">
            <Search className="h-3.5 w-3.5" />
            {searching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching…
              </span>
            ) : (
              <span>
                {cards.length.toLocaleString()} companies
                {source ? <span className="text-evari-dimmer"> · {source}</span> : null}
              </span>
            )}
          </div>
          <div className="flex-1 text-[11px] text-evari-dimmer truncate">{filtersSummary}</div>
          <button
            type="button"
            onClick={() => void doSearch(filters)}
            disabled={searching}
            className="inline-flex items-center gap-1.5 rounded-md border border-evari-line/60 px-2.5 py-1 text-[11px] text-evari-dim hover:text-evari-text hover:border-evari-dimmer disabled:opacity-40"
          >
            <Sparkles className="h-3 w-3" />
            Rerun
          </button>
        </div>

        {/* Picker summary bar */}
        {totalPicked > 0 ? (
          <div className="border-b border-evari-line/40 bg-evari-accent/5 px-4 py-2 flex items-center gap-3">
            <Mail className="h-3.5 w-3.5 text-evari-accent" />
            <div className="text-[12px] text-evari-text">
              {totalPicked} email{totalPicked === 1 ? '' : 's'} picked across{' '}
              {Array.from(emailPicksByDomain.values()).filter((s) => s.size > 0).length} companies
            </div>
            <select
              value={playId}
              onChange={(e) => setPlayId(e.target.value)}
              className="rounded-md bg-evari-ink/40 border border-evari-line/40 px-2 py-1 text-[11px] text-evari-text focus:outline-none focus:border-evari-accent"
            >
              {plays.length === 0 ? (
                <option value="">No plays yet</option>
              ) : (
                plays.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              disabled={sending || !playId}
              onClick={() => void sendToProspects()}
              className="inline-flex items-center gap-1.5 rounded-md bg-evari-accent px-2.5 py-1 text-[11px] font-medium text-evari-ink hover:bg-evari-accent/90 disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send to prospects
            </button>
            <button
              type="button"
              onClick={() => setEmailPicksByDomain(new Map())}
              className="inline-flex items-center justify-center h-6 w-6 rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
              title="Clear picks"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}

        {sendResult ? (
          <div className="border-b border-evari-line/40 bg-evari-success/5 px-4 py-2 text-[12px] text-evari-success">
            Created {sendResult.created} prospect{sendResult.created === 1 ? '' : 's'}
            {sendResult.skipped > 0 ? ` (skipped ${sendResult.skipped} dupes)` : ''}.{' '}
            <button
              type="button"
              onClick={() => setSendResult(null)}
              className="underline hover:no-underline"
            >
              dismiss
            </button>
          </div>
        ) : null}

        {searchError ? (
          <div className="px-4 py-2 bg-evari-danger/10 text-[12px] text-evari-danger border-b border-evari-danger/30">
            {searchError}
          </div>
        ) : null}

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {cards.length === 0 && !searching ? (
            <div className="p-8 text-center text-[12px] text-evari-dimmer">
              No companies match. Tweak the filters on the left, or ask the AI to broaden the search.
            </div>
          ) : null}
          <ul className="divide-y divide-evari-line/30">
            {cards.map((c) => {
              const picks = emailPicksByDomain.get(c.domain);
              return (
                <li
                  key={c.domain}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                    selected === c.domain
                      ? 'bg-evari-surfaceSoft'
                      : 'hover:bg-evari-surface/60',
                  )}
                  onClick={() => void selectCard(c.domain)}
                >
                  <div className="h-8 w-8 shrink-0 rounded-md bg-evari-surfaceSoft flex items-center justify-center overflow-hidden">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-4 w-4 text-evari-dimmer" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-evari-text truncate">
                        {c.name}
                      </span>
                      {c.enriched ? (
                        <BadgeCheck className="h-3 w-3 text-evari-success shrink-0" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-evari-dimmer">
                      <span className="truncate">{c.domain}</span>
                      {c.category ? <span className="truncate">· {c.category}</span> : null}
                      {c.hqLabel ? (
                        <span className="inline-flex items-center gap-0.5">
                          · <MapPin className="h-2.5 w-2.5" /> {c.hqLabel}
                        </span>
                      ) : null}
                      {c.employeeBand ? (
                        <span className="inline-flex items-center gap-0.5">
                          · <Users2 className="h-2.5 w-2.5" /> {c.employeeBand}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-evari-dim">
                    {typeof c.emailCount === 'number' && c.emailCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {c.emailCount}
                      </span>
                    ) : null}
                    {picks && picks.size > 0 ? (
                      <span className="inline-flex items-center gap-1 text-evari-accent">
                        <Check className="h-3 w-3" />
                        {picks.size}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      {/* Right: detail panel */}
      <section className="w-[480px] shrink-0">
        {selected ? (
          <CompanyPanel
            domain={selected}
            company={selectedCompany}
            loading={enrichingDomain === selected}
            log={enrichingDomain === selected ? enrichLog : []}
            onEnrich={(opts) => void enrich(selected, opts)}
            picker={{
              selected: selectedPicks,
              onToggle: (email) => toggleEmailPick(selected, email),
              onSelectAll: () => setAllEmailPicks(selected, selectedEmails, true),
              onSelectNone: () => setAllEmailPicks(selected, selectedEmails, false),
            }}
            actions={
              selectedPicks.size > 0 && playId ? (
                <button
                  type="button"
                  onClick={() => void sendToProspects()}
                  disabled={sending}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-evari-accent px-2.5 py-1.5 text-[12px] font-medium text-evari-ink hover:bg-evari-accent/90 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Send {selectedPicks.size} to prospects
                </button>
              ) : null
            }
          />
        ) : (
          <div className="h-full bg-evari-surface border-l border-evari-line/40 flex items-center justify-center px-10">
            <div className="text-center text-[12px] text-evari-dimmer">
              <Building2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
              Pick a company to see details, emails, and signals.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function summariseFilters(f: DiscoverFiltersType): string {
  const bits: string[] = [];
  if (f.location?.include?.length) bits.push('Location: ' + f.location.include.join(', '));
  if (f.industry?.include?.length) bits.push('Industry: ' + f.industry.include.join(', '));
  if (f.keywords?.include?.length) bits.push('Keywords: ' + f.keywords.include.join(', '));
  if (f.companyName?.include?.length) bits.push('Name: ' + f.companyName.include.join(', '));
  if (f.sizeBands?.length) bits.push('Size: ' + f.sizeBands.join(', '));
  if (f.savedOnly) bits.push('Saved only');
  return bits.length === 0 ? 'No filters — showing cache' : bits.join(' · ');
}
