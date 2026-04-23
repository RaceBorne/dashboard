'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FunnelRibbon } from '@/components/nav/FunnelRibbon';
import { ProjectRail } from '@/components/nav/ProjectRail';
import { STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT } from '@/lib/layout/stageWrapper';
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
  RefreshCw,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyPanel } from '@/components/discover/CompanyPanel';
import { DiscoverFilters } from '@/components/discover/DiscoverFilters';
import { SaveDestinationPanel } from '@/components/discover/SaveDestinationPanel';
interface DiscoveredCompanyLike {
  domain?: string;
  name?: string;
  logoUrl?: string;
  category?: string;
  employeeBand?: string;
  hq?: { full?: string };
}
import type {
  DiscoverCard,
  DiscoveredCompany,
  DiscoverFilters as DiscoverFiltersType,
  Play,
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

  // --- Additive rerun + quick-add (#183) -----------------------------------
  const [expanding, setExpanding] = useState(false);
  const [expandToast, setExpandToast] = useState<string | null>(null);
  const [quickAddValue, setQuickAddValue] = useState('');
  const [quickAddBusy, setQuickAddBusy] = useState(false);

  /** Set of domains whose 'Find more like this' call is currently running.
   *  Used to show a spinner on the right row and prevent double-fire. */
  const [similarBusy, setSimilarBusy] = useState<Set<string>>(new Set());

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

  // The Play this Discover run is bound to — fetched during the seed
  // effect so FunnelRibbon can show its title without a second fetch.
  const [linkedPlay, setLinkedPlay] = useState<Play | null>(null);

  const filtersSummary = useMemo(() => summariseFilters(filters), [filters]);

  // No auto-search on mount — the pristine hero shows first for the
  // unseeded case. The operator triggers a search by typing filters,
  // hitting the AI refine box, or picking a suggestion on the hero.
  // --- One-shot seed from ?playId=. When the user lands on Discover from
  //     a Play's "Load Up Discovery" button we fetch that Play, preload
  //     its strategyShort into the hero prompt, pin the save-destination
  //     play so any send-to-prospects gets the right playId, and then
  //     auto-fire runHero so the search streams in immediately. Further
  //     edits in Discover don't flow back to the Play.
  const searchParams = useSearchParams();
  const seededPlayIdRef = useRef<string | null>(null);
  useEffect(() => {
    const pid = searchParams?.get('playId') ?? null;
    if (!pid) return;
    if (seededPlayIdRef.current === pid) return;
    seededPlayIdRef.current = pid;
    setPlayId(pid);
    void (async () => {
      try {
        const res = await fetch(`/api/plays/${pid}`);
        const data = (await res.json()) as {
          ok?: boolean;
          play?: Play;
        };
        if (data?.play) setLinkedPlay(data.play);
        const short = data?.play?.strategyShort?.trim();
        if (!short) return;
        setHeroPrompt(short);
        // Kick the Discover agent with the seeded prompt. runHero opens
        // the save-destination picker and streams results into `cards`.
        void runHero(short);
      } catch {
        // Non-fatal: user can still type a prompt manually.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);



  const doSearch = useCallback(async (
    f: DiscoverFiltersType,
    opts?: { append?: boolean },
  ): Promise<DiscoverCard[]> => {
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
      const incoming = data.companies ?? [];
      if (opts?.append) {
        // Merge: keep existing cards, append new-domain cards only.
        setCards((prev) => {
          const seen = new Set(prev.map((c) => c.domain));
          const added = incoming.filter((c) => !seen.has(c.domain));
          return [...prev, ...added];
        });
      } else {
        setCards(incoming);
      }
      setSource(data.source ?? null);
      return incoming;
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      return [];
    } finally {
      setSearching(false);
    }
  }, []);

  /**
   * Additive rerun. Asks Claude for 5 new keyword phrases designed to
   * widen the net around the current filters + avoid the domains we
   * already have. Fires a search per keyword, merging new cards into
   * the existing list. Called by the toolbar's Rerun button (#183).
   */
  async function additiveRerun() {
    if (expanding) return;
    setExpanding(true);
    setExpandToast(null);
    const beforeDomains = new Set(cards.map((c) => c.domain));
    try {
      const expandRes = await fetch('/api/discover/expand-queries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filters,
          seenDomains: Array.from(beforeDomains),
          playId: playId || undefined,
          limit: 5,
        }),
      });
      const expandData = (await expandRes.json()) as {
        ok?: boolean;
        keywords?: string[];
        error?: string;
      };
      if (!expandData.ok || !Array.isArray(expandData.keywords)) {
        throw new Error(expandData.error ?? 'Expand failed');
      }
      const newKeywords = expandData.keywords;
      if (newKeywords.length === 0) {
        setExpandToast('No new angles to try right now.');
        return;
      }
      // Fire a search per new keyword. Each run appends new-domain cards
      // to the list; duplicates are silently dropped by doSearch's
      // seen-domain filter.
      for (const kw of newKeywords) {
        const merged: DiscoverFiltersType = {
          ...filters,
          keywords: {
            include: [...(filters.keywords?.include ?? []), kw],
            exclude: filters.keywords?.exclude ?? [],
          },
        };
        await doSearch(merged, { append: true });
      }
      // Count what's new vs what was there when we started.
      const afterDomains = new Set(
        cardsRef.current.map((c) => c.domain),
      );
      let added = 0;
      for (const d of afterDomains) if (!beforeDomains.has(d)) added += 1;
      setExpandToast(
        added > 0
          ? 'Found ' + added + ' new companies across ' + newKeywords.length + ' angles.'
          : 'No new companies surfaced on this pass.',
      );
    } catch (err) {
      setExpandToast(
        err instanceof Error ? err.message : 'Expand failed',
      );
    } finally {
      setExpanding(false);
      setTimeout(() => setExpandToast(null), 6000);
    }
  }

  // Mirror of `cards` in a ref so additiveRerun can read the freshest list
  // after all its appends without waiting for React state to flush.
  const cardsRef = useRef<DiscoverCard[]>([]);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  /**
   * Quick-add: paste a domain (or a full URL), we'll normalise it,
   * trigger enrichment, and prepend a card. If a save folder is active
   * the card will also auto-save via the existing useEffect loop.
   */
  async function quickAdd() {
    const raw = quickAddValue.trim();
    if (!raw || quickAddBusy) return;
    const domain = raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
    if (!domain.includes('.')) {
      setExpandToast('Please paste a domain, e.g. rapha.cc');
      setTimeout(() => setExpandToast(null), 4000);
      return;
    }
    if (cards.some((c) => c.domain === domain)) {
      setExpandToast('Already in the list: ' + domain);
      setTimeout(() => setExpandToast(null), 4000);
      return;
    }
    setQuickAddBusy(true);
    try {
      // Insert a skeleton card immediately so the UI reacts.
      const skeleton: DiscoverCard = {
        domain,
        name: domain.replace(/\.(co\.uk|uk|cc|com|io|org)$/, ''),
      };
      setCards((prev) => [skeleton, ...prev]);
      setQuickAddValue('');
      // Fire enrichment — streams via SSE, but we just wait for the
      // final 'done' event to replace our skeleton with the real card.
      const res = await fetch(
        '/api/discover/enrich/' + encodeURIComponent(domain) +
          '?force=1' +
          (playId ? '&playId=' + encodeURIComponent(playId) : ''),
        { method: 'POST' },
      );
      if (!res.ok || !res.body) {
        throw new Error('HTTP ' + res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let delim = buffer.indexOf('\n\n');
        while (delim !== -1) {
          const raw = buffer.slice(0, delim).trim();
          buffer = buffer.slice(delim + 2);
          delim = buffer.indexOf('\n\n');
          if (!raw.startsWith('data:')) continue;
          const payload = raw.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as {
              phase?: string;
              company?: DiscoveredCompanyLike;
            };
            if (evt.phase === 'done' && evt.company) {
              const realCard: DiscoverCard = {
                domain: evt.company.domain ?? domain,
                name: evt.company.name ?? domain,
                logoUrl: evt.company.logoUrl,
                category: evt.company.category,
                employeeBand: evt.company.employeeBand,
                hqLabel: evt.company.hq?.full,
              };
              setCards((prev) =>
                prev.map((c) => (c.domain === domain ? realCard : c)),
              );
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
      setExpandToast('Added ' + domain);
      setTimeout(() => setExpandToast(null), 4000);
    } catch (err) {
      setExpandToast(
        err instanceof Error ? 'Add failed: ' + err.message : 'Add failed',
      );
      setTimeout(() => setExpandToast(null), 5000);
      // Rollback skeleton on failure.
      setCards((prev) => prev.filter((c) => c.domain !== domain));
    } finally {
      setQuickAddBusy(false);
    }
  }

  /**
   * Find 5 peer companies at the same tier / audience as the clicked
   * row. Server calls Claude with the company's cached profile + the
   * venture context + a 'do not return these' list. For each returned
   * domain, we prepend a skeleton card and fire enrichment in the
   * background (same pattern as quickAdd). #184.
   */
  async function findSimilar(refDomain: string) {
    if (similarBusy.has(refDomain)) return;
    setSimilarBusy((prev) => {
      const next = new Set(prev);
      next.add(refDomain);
      return next;
    });
    try {
      const seenDomains = cards.map((c) => c.domain);
      const res = await fetch('/api/discover/find-similar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: refDomain,
          playId: playId || undefined,
          seenDomains,
          limit: 5,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        peers?: Array<{ domain: string; name?: string; why?: string }>;
        reasoning?: string;
        error?: string;
      };
      if (!data.ok || !Array.isArray(data.peers) || data.peers.length === 0) {
        setExpandToast(data.error ?? 'No peers surfaced');
        setTimeout(() => setExpandToast(null), 5000);
        return;
      }
      // Prepend skeletons for every new peer so the list reacts
      // immediately. Enrichment then fills each one in.
      const peers = data.peers;
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.domain));
        const skeletons: DiscoverCard[] = [];
        for (const pr of peers) {
          if (seen.has(pr.domain)) continue;
          seen.add(pr.domain);
          skeletons.push({ domain: pr.domain, name: pr.name ?? pr.domain });
        }
        return [...skeletons, ...prev];
      });
      setExpandToast(
        'Found ' + peers.length + ' peers for ' + refDomain + '. Enriching…',
      );
      // Kick off enrichment for each in parallel; results land via SSE.
      await Promise.all(
        peers.map(async (pr) => {
          try {
            const enrichRes = await fetch(
              '/api/discover/enrich/' +
                encodeURIComponent(pr.domain) +
                '?force=0' +
                (playId ? '&playId=' + encodeURIComponent(playId) : ''),
              { method: 'POST' },
            );
            if (!enrichRes.ok || !enrichRes.body) return;
            const reader = enrichRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let delim = buffer.indexOf('\n\n');
              while (delim !== -1) {
                const raw = buffer.slice(0, delim).trim();
                buffer = buffer.slice(delim + 2);
                delim = buffer.indexOf('\n\n');
                if (!raw.startsWith('data:')) continue;
                const payload = raw.slice(5).trim();
                if (!payload) continue;
                try {
                  const evt = JSON.parse(payload) as {
                    phase?: string;
                    company?: DiscoveredCompanyLike;
                  };
                  if (evt.phase === 'done' && evt.company) {
                    const realCard: DiscoverCard = {
                      domain: evt.company.domain ?? pr.domain,
                      name: evt.company.name ?? pr.domain,
                      logoUrl: evt.company.logoUrl,
                      category: evt.company.category,
                      employeeBand: evt.company.employeeBand,
                      hqLabel: evt.company.hq?.full,
                    };
                    setCards((prev) =>
                      prev.map((c) =>
                        c.domain === pr.domain ? realCard : c,
                      ),
                    );
                  }
                } catch {
                  // ignore malformed chunks
                }
              }
            }
          } catch {
            // Non-fatal per peer; skeleton stays in the list.
          }
        }),
      );
      setTimeout(() => setExpandToast(null), 5000);
    } catch (err) {
      setExpandToast(
        err instanceof Error ? 'Find similar failed: ' + err.message : 'Find similar failed',
      );
      setTimeout(() => setExpandToast(null), 5000);
    } finally {
      setSimilarBusy((prev) => {
        const next = new Set(prev);
        next.delete(refDomain);
        return next;
      });
    }
  }

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
            playId: playId || undefined,
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

  /**
   * Bulk send every checked company to Prospects. For each selected
   * company, pick the best email we can find:
   *   1. People[].primaryEmail where candidate is HIGH confidence (from
   *      the enrichment engine).
   *   2. Otherwise the first address on company.emails[] (generic or
   *      named). At least the company gets saved so the operator can
   *      come back and enrich it properly.
   * Companies with NO email at all are counted in `skipped` and
   * surfaced in the summary chip.
   */
  async function sendSelectedCompaniesToProspects() {
    if (!playId || companyChecked.size === 0) return;
    setSending(true);
    setSendResult(null);
    try {
      const picks: Array<{ domain: string; emails: string[] }> = [];
      let skippedNoEmail = 0;
      for (const domain of companyChecked) {
        const co = companyByDomain.get(domain);
        const engineEmails = new Set<string>();
        for (const person of co?.people ?? []) {
          const primary = person.primaryEmail;
          if (!primary) continue;
          const cand = person.emailCandidates?.find((c) => c.email === primary);
          if (cand?.confidence === 'HIGH') engineEmails.add(primary);
        }
        const fallback = (co?.emails ?? []).map((e) => e.address);
        const emails = engineEmails.size > 0
          ? Array.from(engineEmails)
          : fallback.slice(0, 1);
        if (emails.length === 0) {
          skippedNoEmail += 1;
          continue;
        }
        picks.push({ domain, emails });
      }
      if (picks.length === 0) {
        setSendResult({ created: 0, skipped: skippedNoEmail });
        return;
      }
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
        setSendResult({
          created: data.created ?? 0,
          skipped: (data.skipped ?? 0) + skippedNoEmail,
        });
        setCompanyChecked(new Set());
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
    <div className={STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT}>
      {(() => {
        const urlPid = searchParams?.get('playId') ?? null;
        return <FunnelRibbon stage="discovery" playId={urlPid ?? ''} play={linkedPlay} />;
      })()}
      <div className="flex gap-4 flex-1 min-h-0">
      <ProjectRail activePlayId={playId} />
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

      {/* Always a 50/50 split. Left column = hero before any search,
          results list after. Right column = CompanyPanel when a card
          is selected, SaveDestinationPanel while the save picker is
          open, or an empty placeholder otherwise. */}
      <div className="flex-1 min-w-0 h-full flex gap-4">
      {!hasSearched ? (
        <main className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface flex flex-col items-center justify-center px-8 text-center">
          <div className="h-12 w-12 rounded-full bg-evari-surfaceSoft flex items-center justify-center mb-4">
            <Sparkles className="h-5 w-5 text-evari-dimmer" />
          </div>
          <div className="text-[14px] font-semibold text-evari-text mb-1">
            Results will appear here
          </div>
          <div className="text-[12px] text-evari-dim max-w-sm">
            Tweak the filters on the left and hit{' '}
            <span className="text-evari-text font-medium">Find companies</span>.
            Matches stream into this column as the agent finds them.
          </div>
        </main>
      ) : (
      <main className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface flex flex-col overflow-hidden">
        {/* Toolbar — lozenge row. Everything is whitespace-nowrap and
            rounded-full so the narrow 50/50 column never wraps. The
            title shrinks/truncates; buttons keep their full shape. */}
        <div className="shrink-0 border-b border-evari-line/30 px-4 py-2.5 flex items-center gap-2">
          <h2 className="min-w-0 truncate text-[13px] font-semibold text-evari-text">
            {searching ? (
              <span className="inline-flex items-center gap-2 text-evari-dim">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </span>
            ) : (
              <>
                <span className="text-evari-text">{cards.length.toLocaleString()}</span>{' '}
                <span className="text-evari-dim font-normal">companies</span>
              </>
            )}
          </h2>
          <div className="flex-1" />
          {/* Save destination pill. */}
          {saveTarget ? (
            <button
              type="button"
              onClick={() => setSaveSetupOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-evari-accent/15 text-evari-accent px-3 py-1.5 text-[11.5px] font-medium hover:bg-evari-accent/25 whitespace-nowrap max-w-[180px]"
              title={`Saving to ${saveTarget}`}
            >
              <Check className="h-3 w-3 shrink-0" />
              <span className="truncate">{saveTarget}</span>
              {savedCount > 0 ? <span className="shrink-0 opacity-70">· {savedCount}</span> : null}
            </button>
          ) : !saveSetupOpen ? (
            <button
              type="button"
              onClick={() => setSaveSetupOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-evari-line/60 px-3 py-1.5 text-[11.5px] text-evari-dim hover:text-evari-text hover:border-evari-dim whitespace-nowrap"
              title="Pick a folder to auto-save results"
            >
              <Sparkles className="h-3 w-3" />
              Save to folder
            </button>
          ) : null}
          {/* Quick-add by domain (#183). Paste a domain or URL and we'll
              enrich it + prepend it to the list. Never replaces existing
              cards; always additive. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void quickAdd();
            }}
            className="inline-flex items-center gap-1 shrink-0"
          >
            <input
              type="text"
              value={quickAddValue}
              onChange={(e) => setQuickAddValue(e.target.value)}
              placeholder="Add domain..."
              disabled={quickAddBusy}
              className="h-7 rounded-full border border-evari-line/60 bg-white pl-3 pr-2 text-[11.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent w-40 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={quickAddBusy || !quickAddValue.trim()}
              className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-evari-line/60 text-evari-dim hover:text-evari-text hover:border-evari-dimmer disabled:opacity-40"
              title="Add this company to the results"
              aria-label="Add domain"
            >
              {quickAddBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </button>
          </form>
          {/* Rerun — now additive + AI-expanded. Asks Claude for 5 new
              keyword angles, fires a search per angle, merges new-domain
              results into the list (never replaces). */}
          <button
            type="button"
            onClick={() => void additiveRerun()}
            disabled={searching || expanding}
            className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-evari-line/60 text-evari-dim hover:text-evari-text hover:border-evari-dimmer disabled:opacity-40 whitespace-nowrap shrink-0"
            title="Expand the search: ask Claude for new angles and add to the list"
            aria-label="Expand search"
          >
            {expanding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
          {expandToast ? (
            <div className="shrink-0 inline-flex items-center gap-1 rounded-full bg-evari-accent/10 text-evari-accent text-[11px] px-3 py-1 whitespace-nowrap">
              {expandToast}
            </div>
          ) : null}
          {/* Select-all lozenge — segmented toggle. */}
          <button
            type="button"
            onClick={() => {
              const next = new Set(companyChecked);
              if (next.size === cards.length) next.clear();
              else for (const c of cards) next.add(c.domain);
              setCompanyChecked(next);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-evari-line/60 px-3 py-1.5 text-[11.5px] text-evari-text hover:bg-evari-surfaceSoft whitespace-nowrap shrink-0"
          >
            <span className={cn(
              'h-3.5 w-3.5 rounded-[3px] border inline-flex items-center justify-center shrink-0',
              companyChecked.size > 0 && companyChecked.size === cards.length
                ? 'bg-evari-accent border-evari-accent'
                : companyChecked.size > 0
                  ? 'bg-evari-accent/40 border-evari-accent'
                  : 'border-evari-dimmer'
            )}>
              {companyChecked.size > 0 ? (
                <Check className="h-2.5 w-2.5 text-evari-ink" />
              ) : null}
            </span>
            {companyChecked.size > 0
              ? `${companyChecked.size}/${cards.length}`
              : 'Select all'}
          </button>
          {/* Send selected companies to Prospects. Only visible when
              at least one company is ticked. Lives next to Find people
              so the 'I've picked my row, now what?' action is right
              there in the operator's field of view. */}
          {companyChecked.size > 0 && playId ? (
            <button
              type="button"
              onClick={() => void sendSelectedCompaniesToProspects()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-full bg-evari-gold px-3 py-1.5 text-[11.5px] font-semibold text-evari-goldInk hover:bg-evari-gold/90 whitespace-nowrap shrink-0 disabled:opacity-60"
              title={'Save ' + companyChecked.size + ' companies to the Prospects folder for this venture'}
            >
              {sending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Mail className="h-3 w-3" />
              )}
              Send {companyChecked.size} to Prospects
            </button>
          ) : null}
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void findSimilar(c.domain);
                      }}
                      disabled={similarBusy.has(c.domain)}
                      className="inline-flex items-center gap-1 rounded-md border border-evari-line/60 bg-white px-2 py-1 text-[11px] text-evari-dim hover:text-evari-text hover:border-evari-dimmer disabled:opacity-50 whitespace-nowrap"
                      title={'Find 5 peer companies at the same tier as ' + c.name}
                    >
                      {similarBusy.has(c.domain) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Find similar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
      )}
      <section className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface overflow-hidden">
      {selected ? (
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
      ) : saveSetupOpen ? (
          <SaveDestinationPanel
            saveTarget={saveTarget}
            savedCount={savedCount}
            busy={aiBusy}
            prompt={lastHeroPrompt}
            onPick={(folder) => setSaveTarget(folder)}
            onCreate={(folder) => setSaveTarget(folder)}
            onDismiss={() => setSaveSetupOpen(false)}
          />
      ) : (
          <EmptyDetailsPlaceholder onOpenPicker={() => setSaveSetupOpen(true)} hasSearched={hasSearched} />
      )}
      </section>
      </div>
      </div>
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

function EmptyDetailsPlaceholder({ onOpenPicker, hasSearched }: { onOpenPicker: () => void; hasSearched: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 text-center">
      <div className="h-12 w-12 rounded-full bg-evari-surfaceSoft inline-flex items-center justify-center mb-4">
        <Sparkles className="h-5 w-5 text-evari-dimmer" />
      </div>
      <div className="text-[14px] font-semibold text-evari-text mb-1">
        {hasSearched ? "Pick a company to see details" : "Details will appear here"}
      </div>
      <div className="text-[12px] text-evari-dim max-w-sm">
        {hasSearched
          ? "Click any row on the left to open the company panel, or save the whole run to a Prospects folder."
          : "Run a hero search on the left. As results stream in, you can save them to a Prospects folder in one click."}
      </div>
      <button
        type="button"
        onClick={onOpenPicker}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-evari-line/60 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text hover:border-evari-dim"
      >
        <Sparkles className="h-3 w-3" />
        Choose a save destination
      </button>
    </div>
  );
}
