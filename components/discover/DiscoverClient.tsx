'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { SaveDestinationPanel } from '@/components/discover/SaveDestinationPanel';
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
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [source, setSource] = useState<'dfs' | 'cache' | 'mixed' | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [companyByDomain, setCompanyByDomain] = useState<Map<string, DiscoveredCompany | null>>(new Map());
  const [enrichingDomain, setEnrichingDomain] = useState<string | null>(null);
  const [enrichLog, setEnrichLog] = useState<string[]>([]);
  const [enrichPassByDomain, setEnrichPassByDomain] = useState<Map<string, number>>(new Map());

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
  const [filtersResetKey, setFiltersResetKey] = useState(0);

  // Bulk select — mirrors the Save all / Find all people actions on the
  // results header. Checkbox per row; master checkbox toggles the visible set.
  const [companyChecked, setCompanyChecked] = useState<Set<string>>(new Set());

  // Pre-commit save destination — while the hero agent is running, the
  // right column shows a folder picker; once picked, every streamed
  // candidate auto-saves into that Prospects folder.
  const [saveTarget, setSaveTarget] = useState<string | null>(null);
  const [saveSetupOpen, setSaveSetupOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [lastHeroPrompt, setLastHeroPrompt] = useState('');
  // Domains we've already auto-saved in this run. Kept in a ref so the
  // effect below doesn't loop when we update it.
  const autoSavedRef = useRef<Set<string>>(new Set());

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
    // Open the save-destination picker in the right column. Non-blocking —
    // the AI keeps running while the operator decides.
    setLastHeroPrompt(p);
    setSaveTarget(null);
    setSavedCount(0);
    autoSavedRef.current = new Set();
    setSaveSetupOpen(true);
    await handleAiRefine(p);
    setHeroPrompt('');
  }

  // Auto-save any streamed cards that aren't already saved into the
  // current saveTarget folder. Fires whenever cards or saveTarget change.
  // Idempotent via autoSavedRef.
  useEffect(() => {
    if (!saveTarget) return;
    const pending = cards.filter((c) => !autoSavedRef.current.has(c.domain));
    if (pending.length === 0) return;
    for (const c of pending) autoSavedRef.current.add(c.domain);
    void (async () => {
      try {
        const res = await fetch('/api/discover/save-companies', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            folder: saveTarget,
            companies: pending.map((c) => ({
              domain: c.domain,
              name: c.name,
              logoUrl: c.logoUrl,
              category: c.category,
              employeeBand: c.employeeBand,
              hqLabel: c.hqLabel,
            })),
          }),
        });
        const data = (await res.json()) as { ok?: boolean; created?: number };
        if (data.ok && typeof data.created === 'number' && data.created > 0) {
          setSavedCount((n) => n + (data.created ?? 0));
          window.dispatchEvent(new Event('evari:nav-counts-dirty'));
        }
      } catch {
        // Non-fatal — retry on the next card batch.
      }
    })();
  }, [cards, saveTarget]);

  // AI agent: stream SSE from /api/discover/agent. Candidates appear
  // progressively in the results grid; on 'done' we merge the filters and
  // run a regular filtered search to enrich with any additional matches.
  async function handleAiRefine(prompt: string) {
    setAiBusy(true);
    setAiStatus('Understanding your brief…');
    setSearchError(null);
    setSearching(true);
    setHasSearched(true);
    setCards([]); // start fresh; candidates will stream in
    const seededDomains = new Set<string>();
    try {
      const res = await fetch('/api/discover/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filters, prompt }),
      });
      if (!res.body) throw new Error('no stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalFilters: DiscoverFiltersType | null = null;
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
              const evt = JSON.parse(line.slice(6)) as {
                phase?: string;
                message?: string;
                tool?: string;
                query?: string;
                count?: number;
                domain?: string;
                title?: string;
                source?: string;
                filters?: DiscoverFiltersType;
                domains?: Array<{ domain: string; title?: string; category?: string; source?: string }>;
                reasoning?: string;
              };
              const phase = evt.phase;
              if (phase === 'status' && evt.message) {
                setAiStatus(evt.message);
              } else if (phase === 'search' && evt.query) {
                setAiStatus('Searching • ' + evt.query);
              } else if (phase === 'found' && typeof evt.count === 'number') {
                setAiStatus('Found ' + evt.count + ' hits, scanning…');
              } else if (phase === 'candidate' && evt.domain) {
                if (!seededDomains.has(evt.domain)) {
                  seededDomains.add(evt.domain);
                  const d = evt.domain;
                  setCards((prev) =>
                    prev.some((c) => c.domain === d)
                      ? prev
                      : [
                          ...prev,
                          {
                            domain: d,
                            name: evt.title ?? d,
                            logoUrl:
                              'https://www.google.com/s2/favicons?domain=' +
                              encodeURIComponent(d) +
                              '&sz=128',
                            category: undefined,
                            enriched: false,
                            emailCount: 0,
                          },
                        ],
                  );
                }
              } else if (phase === 'done') {
                finalFilters = evt.filters ?? null;
                if (evt.reasoning) setAiStatus(evt.reasoning);
                else setAiStatus('Agent finished • merging with filter search…');
              } else if (phase === 'error' && evt.message) {
                setSearchError(evt.message);
              }
            } catch {
              /* ignore malformed chunks */
            }
          }
        }
      }
      if (finalFilters) {
        const merged: DiscoverFiltersType = { ...EMPTY_FILTERS, ...finalFilters };
        setFilters(merged);
        // Layer standard filter search on top of the agent-seeded cards.
        try {
          const res2 = await fetch('/api/discover/search', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filters: merged, limit: 100 }),
          });
          const data = (await res2.json()) as {
            ok?: boolean;
            companies?: DiscoverCard[];
            source?: 'dfs' | 'cache' | 'mixed';
          };
          if (data.ok && Array.isArray(data.companies)) {
            setCards((prev) => {
              const byDomain = new Map<string, DiscoverCard>();
              for (const c of prev) byDomain.set(c.domain, c);
              for (const c of data.companies ?? []) {
                const existing = byDomain.get(c.domain);
                byDomain.set(c.domain, existing ? { ...c, ...existing } : c);
              }
              return Array.from(byDomain.values());
            });
            setSource(data.source ?? null);
          }
        } catch {
          /* search errors are non-fatal — agent-seeded cards still show */
        }
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Agent failed');
    } finally {
      setAiBusy(false);
      setAiStatus(null);
      setSearching(false);
    }
  }

  // Enrich one domain via SSE. Pass { cacheOnly: true } for a no-work probe
  // that resolves from the 30-day Supabase cache or returns company=null.
  // Pass { budget: N } to cap the agent's tool-call budget (4..18).
  async function enrich(
    domain: string,
    opts: { force?: boolean; cacheOnly?: boolean; budget?: number } = {},
  ) {
    if (!opts.cacheOnly) {
      setEnrichingDomain(domain);
      setEnrichLog([]);
    }
    try {
      const qs = new URLSearchParams();
      if (opts.force) qs.set('force', '1');
      if (opts.cacheOnly) qs.set('cacheOnly', '1');
      if (opts.budget) qs.set('budget', String(opts.budget));
      const query = qs.toString();
      const url = `/api/discover/enrich/${encodeURIComponent(domain)}${query ? '?' + query : ''}`;
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
                company?: DiscoveredCompany | null;
                cached?: boolean;
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
              if (phase === 'done') {
                if (payload.company) {
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
                } else {
                  // cacheOnly probe with no hit — remember that we checked.
                  setCompanyByDomain((m) => {
                    if (m.has(domain)) return m;
                    const next = new Map(m);
                    next.set(domain, null);
                    return next;
                  });
                }
                // Count a pass only for real enrichments (not cached probes).
                if (!opts.cacheOnly && !payload.cached) {
                  setEnrichPassByDomain((m) => {
                    const next = new Map(m);
                    next.set(domain, (next.get(domain) ?? 0) + 1);
                    return next;
                  });
                }
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

  // Select a card. The panel renders immediately from the DiscoverCard
  // (name / logo / category / size / HQ) — no agent call. We fire a
  // cache-only probe in the background: if a fresh enrichment exists the
  // panel fills in; otherwise the operator can hit "Find emails & details"
  // to run a bounded 8-step agent pass.
  async function selectCard(domain: string) {
    setSelected(domain);
    if (companyByDomain.has(domain)) return;
    void enrich(domain, { cacheOnly: true });
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

  const selectedCard = selected ? cards.find((c) => c.domain === selected) ?? null : null;
  const cachedCompany = selected ? companyByDomain.get(selected) ?? null : null;
  // Paint the panel even before enrichment lands by synthesising a
  // DiscoveredCompany stub from whatever we know from the DiscoverCard.
  const selectedCompany: DiscoveredCompany | null = cachedCompany
    ? cachedCompany
    : selectedCard
      ? {
          domain: selectedCard.domain,
          name: selectedCard.name,
          logoUrl: selectedCard.logoUrl,
          category: selectedCard.category,
          employeeBand: selectedCard.employeeBand,
          hq: selectedCard.hqLabel ? { full: selectedCard.hqLabel } : undefined,
        }
      : null;
  const selectedPicks = selected ? emailPicksByDomain.get(selected) ?? new Set<string>() : new Set<string>();
  const selectedEmails = (selectedCompany?.emails ?? []).map((e) => e.address);

  return (
    <div className="flex gap-4 p-4 h-[calc(100vh-56px)] bg-evari-ink">
      {/* Left: filters */}
      <aside className="w-[380px] shrink-0 rounded-xl bg-evari-surface overflow-hidden flex flex-col">
        <DiscoverFilters
          key={filtersResetKey}
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            void doSearch(next);
          }}
          onAiRefine={handleAiRefine}
          aiStatus={aiStatus}
          onClearAll={() => {
            setFilters(EMPTY_FILTERS);
            setCards([]);
            setSelected(null);
            setSearchError(null);
            setSource(null);
            setHeroPrompt('');
            setCompanyChecked(new Set());
            setHasSearched(false);
            setFiltersResetKey((k) => k + 1);
            setSaveSetupOpen(false);
            setSaveTarget(null);
            setSavedCount(0);
            autoSavedRef.current = new Set();
          }}
          aiBusy={aiBusy}
        />
      </aside>

      {/* Pristine hero */}
      {!hasSearched ? (
        <div className="flex-1 min-w-0 rounded-xl bg-evari-surface flex flex-col items-center justify-center px-8">
          <div className="w-full max-w-2xl">
            <h1 className="text-left text-2xl font-semibold text-evari-text mb-6 pl-1">
              What company are we searching for
            </h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runHero(heroPrompt);
              }}
              className="relative flex items-center min-h-[60px] rounded-xl border border-evari-line/40 bg-white focus-within:border-evari-accent shadow-sm"
            >
              <div className="pl-4 pr-3 shrink-0 flex items-center self-stretch pointer-events-none">
                <Sparkles className="h-4 w-4 text-evari-accent" />
              </div>
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
                className="flex-1 min-w-0 resize-none bg-transparent pr-14 py-4 text-[14px] leading-6 text-slate-900 placeholder:text-slate-400 focus:placeholder:text-transparent focus:outline-none"
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
      <div className="flex-1 min-w-0 h-full flex gap-4">
      <main
        className={cn(
          'min-w-0 h-full rounded-xl bg-evari-surface flex flex-col overflow-hidden transition-[flex-basis] duration-300 ease-in-out',
          selected || saveSetupOpen ? 'basis-1/2 flex-1' : 'basis-full flex-1',
        )}
      >
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
          {saveTarget ? (
            <button
              type="button"
              onClick={() => setSaveSetupOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-evari-accent/15 text-evari-accent px-3 py-1.5 text-[12px] font-medium hover:bg-evari-accent/25"
              title="Manage save destination"
            >
              <Check className="h-3 w-3" />
              Saving to {saveTarget}
              {savedCount > 0 ? ` · ${savedCount}` : ''}
            </button>
          ) : !saveSetupOpen ? (
            <button
              type="button"
              onClick={() => setSaveSetupOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-evari-line/60 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text hover:border-evari-dim"
              title="Pick a folder to auto-save results"
            >
              <Sparkles className="h-3 w-3" />
              Save to folder
            </button>
          ) : null}
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
                  <div className="h-11 w-11 shrink-0 rounded-md bg-white border border-evari-line/40 flex items-center justify-center overflow-hidden p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.logoUrl ?? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=128`}
                      alt=""
                      className="max-h-full max-w-full object-contain"
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
      {selected ? (
      <section className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface overflow-hidden">
          <CompanyPanel
            key={selected}
            domain={selected}
            company={selectedCompany}
            loading={enrichingDomain === selected}
            log={enrichingDomain === selected ? enrichLog : []}
            enrichPassCount={enrichPassByDomain.get(selected) ?? 0}
            onEnrich={(opts) => {
              const pass = enrichPassByDomain.get(selected) ?? 0;
              void enrich(selected, {
                force: true,
                budget: pass === 0 ? 8 : 14,
                ...(opts ?? {}),
              });
            }}
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
      </section>
      ) : saveSetupOpen ? (
      <section className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface overflow-hidden">
          <SaveDestinationPanel
            saveTarget={saveTarget}
            savedCount={savedCount}
            busy={aiBusy}
            prompt={lastHeroPrompt}
            onPick={(folder) => setSaveTarget(folder)}
            onCreate={(folder) => setSaveTarget(folder)}
            onDismiss={() => setSaveSetupOpen(false)}
          />
      </section>
      ) : null}
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
