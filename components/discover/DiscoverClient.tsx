'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  BadgeCheck,
  Check,
  ChevronDown,
  Loader2,
  Search,
  Sparkles,
  Users2,
  MapPin,
  Mail,
  Send,
  X,
  ArrowUp,
  UserSearch,
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

  // Pristine-state hero: before the operator has run any intentional
  // search, we blank the results + panel and render a centered prompt.
  const [hasSearched, setHasSearched] = useState(false);
  const [heroPrompt, setHeroPrompt] = useState('');

  // Bulk select — mirrors the Save all / Find all people actions on the
  // results header. Checkbox per row; master checkbox toggles the visible set.
  const [companyChecked, setCompanyChecked] = useState<Set<string>>(new Set());

  const filtersSummary = useMemo(() => summariseFilters(filters), [filters]);

  // No auto-search on mount — the pristine hero shows first. The operator
  // triggers a search by typing filters, hitting the AI refine box, or
  // picking a suggestion on the hero.

  const doSearch = useCallback(async (f: DiscoverFiltersType) => {
    setHasSearched(true);
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

  async function runHero(prompt: string) {
    const p = prompt.trim();
    if (!p) return;
    await handleAiRefine(p);
    setHeroPrompt('');
  }

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

  const totalEmailsVisible = useMemo(() => {
    let n = 0;
    for (const c of cards) {
      if (typeof c.emailCount === 'number') n += c.emailCount;
    }
    return n;
  }, [cards]);

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
    <div className="flex gap-4 p-4 h-[calc(100vh-56px)] bg-evari-ink">
      {/* Left: filters */}
      <aside className="w-[380px] shrink-0 rounded-xl bg-evari-surface overflow-hidden flex flex-col">
        <DiscoverFilters
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            void doSearch(next);
          }}
          onAiRefine={handleAiRefine}
          onClearAll={() => {
            setFilters(EMPTY_FILTERS);
            if (hasSearched) void doSearch(EMPTY_FILTERS);
          }}
          aiBusy={aiBusy}
        />
      </aside>

      {/* Pristine hero */}
      {!hasSearched ? (
        <div className="flex-1 min-w-0 rounded-xl bg-evari-surface flex flex-col items-center justify-center px-8">
          <div className="w-full max-w-2xl">
            <h1 className="text-center text-2xl font-semibold text-evari-text mb-6">
              What companies are you targeting?
            </h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runHero(heroPrompt);
              }}
              className="relative rounded-xl border border-evari-line/40 bg-white focus-within:border-evari-accent shadow-sm"
            >
              <Sparkles className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-evari-accent" />
              <textarea
                value={heroPrompt}
                onChange={(e) => setHeroPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void runHero(heroPrompt);
                  }
                }}
                placeholder="Describe who we are searching for."
                rows={1}
                className="w-full resize-none bg-transparent pl-11 pr-14 py-4 text-[14px] text-evari-ink placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={aiBusy || !heroPrompt.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-lg bg-evari-ink/5 text-evari-dim hover:bg-evari-accent hover:text-white disabled:opacity-40 disabled:hover:bg-evari-ink/5 disabled:hover:text-evari-dim"
              >
                {aiBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Middle + right — animated grid. When nothing is selected the right
          column collapses to 0fr; on selection it expands to 1fr and the
          detail panel translates in from the right. */}
      {hasSearched ? (
      <div
        className={cn(
          'flex-1 min-w-0 grid gap-4 transition-[grid-template-columns] duration-500 ease-in-out',
          selected ? 'grid-cols-[1fr_1fr]' : 'grid-cols-[1fr_0fr]',
        )}
      >
      <main className="min-w-0 rounded-xl bg-evari-surface flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="shrink-0 border-b border-evari-line/30 px-5 py-3 flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-evari-text">
            {searching ? (
              <span className="inline-flex items-center gap-2 text-evari-dim">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </span>
            ) : (
              <>
                {cards.length.toLocaleString()} companies match your filters
              </>
            )}
          </h2>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void doSearch(filters)}
            disabled={searching}
            className="inline-flex items-center gap-1.5 rounded-md border border-evari-line/60 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text hover:border-evari-dimmer disabled:opacity-40"
            title="Re-run with current filters"
          >
            <Sparkles className="h-3 w-3" />
            Rerun
          </button>
          <button
            type="button"
            onClick={() => {
              const next = new Set(companyChecked);
              if (next.size === cards.length) next.clear();
              else for (const c of cards) next.add(c.domain);
              setCompanyChecked(next);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-evari-line/60 px-3 py-1.5 text-[12px] text-evari-text hover:bg-evari-surfaceSoft"
          >
            {companyChecked.size > 0 && companyChecked.size === cards.length
              ? 'Unselect all'
              : companyChecked.size > 0
                ? `${companyChecked.size} selected`
                : 'Save all companies'}
            <ChevronDown className="h-3 w-3 text-evari-dimmer" />
          </button>
          <button
            type="button"
            onClick={() => {
              // "Find all people" — pre-select every known email across all
              // visible companies, so the operator can send them in one click.
              const next = new Map<string, Set<string>>();
              for (const c of cards) {
                const co = companyByDomain.get(c.domain);
                const emails = (co?.emails ?? []).map((e) => e.address);
                if (emails.length > 0) next.set(c.domain, new Set(emails));
              }
              setEmailPicksByDomain(next);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-evari-accent px-3 py-1.5 text-[12px] font-medium text-evari-ink hover:bg-evari-accent/90"
          >
            <UserSearch className="h-3 w-3" />
            Find all people · {totalEmailsVisible} results
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
              className="rounded-md bg-evari-surface border border-evari-line/40 px-2 py-1 text-[11px] text-evari-text focus:outline-none focus:border-evari-accent"
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
          <div className="border-b border-evari-line/40 bg-evari-success/10 px-4 py-2 text-[12px] text-evari-success">
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
          <ul className="divide-y divide-evari-line/40">
            {cards.map((c) => {
              const picks = emailPicksByDomain.get(c.domain);
              const checked = companyChecked.has(c.domain);
              return (
                <li
                  key={c.domain}
                  className={cn(
                    'group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors',
                    selected === c.domain
                      ? 'bg-evari-accent/5 border-l-2 border-evari-accent -ml-[2px] pl-[calc(1.25rem-2px)]'
                      : 'hover:bg-evari-surface/60',
                  )}
                  onClick={() => void selectCard(c.domain)}
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompanyChecked((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.domain)) next.delete(c.domain);
                        else next.add(c.domain);
                        return next;
                      });
                    }}
                    className={cn(
                      'h-4 w-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors',
                      checked
                        ? 'bg-evari-accent border-evari-accent'
                        : 'border-evari-dimmer group-hover:border-evari-dim',
                    )}
                  >
                    {checked ? <Check className="h-2.5 w-2.5 text-evari-ink" /> : null}
                  </span>
                  <div className="h-11 w-11 shrink-0 rounded-md bg-evari-surfaceSoft border border-evari-line/40 flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.logoUrl ?? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=128`}
                      alt=""
                      className={c.logoUrl ? 'h-full w-full object-cover' : 'h-6 w-6 object-contain'}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[14px] font-semibold text-evari-text truncate">
                        {c.name}
                      </span>
                      <span className="text-[12px] text-evari-dimmer truncate">
                        {c.domain}
                      </span>
                      {c.enriched ? (
                        <BadgeCheck className="h-3.5 w-3.5 text-evari-success shrink-0" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-evari-dim mt-1">
                      {c.employeeBand ? (
                        <span className="inline-flex items-center gap-1">
                          <Users2 className="h-3 w-3 text-evari-dimmer" />
                          {c.employeeBand}
                        </span>
                      ) : null}
                      {c.category ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-evari-dimmer" />
                          {c.category}
                        </span>
                      ) : null}
                      {c.hqLabel ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-evari-dimmer" />
                          {c.hqLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {picks && picks.size > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-evari-accent/15 text-evari-accent px-2 py-1 text-[11px] font-medium">
                        <Check className="h-3 w-3" />
                        {picks.size} picked
                      </span>
                    ) : null}
                    {typeof c.emailCount === 'number' && c.emailCount > 0 ? (
                      <span className="inline-flex items-center rounded-md bg-evari-surfaceSoft text-evari-dim px-2.5 py-1 text-[11px]">
                        {c.emailCount} email{c.emailCount === 1 ? ' address' : ' addresses'}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
      <section className="min-w-0 rounded-xl bg-evari-surface overflow-hidden">
        <div
          className={cn(
            'h-full transition-transform duration-500 ease-in-out',
            selected ? 'translate-x-0' : 'translate-x-full',
          )}
        >
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
          <div className="h-full flex items-center justify-center px-10">
            <div className="text-center text-[12px] text-evari-dimmer">
              <Building2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
              Pick a company to see details, emails, and signals.
            </div>
          </div>
        )}
        </div>
      </section>
      </div>
      ) : null}
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
