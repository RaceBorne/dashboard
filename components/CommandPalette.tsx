'use client';

/**
 * Global Cmd+K (Ctrl+K on Windows/Linux) command palette.
 *
 * Mounted once in the app shell. Listens for the keyboard combo
 * everywhere, opens an overlay, debounces a query, fans it out to
 * /api/search, and renders mixed results grouped by kind.
 *
 * Up/Down to navigate, Enter to open, Esc to close.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban,
  CalendarDays,
  Image as ImageIcon,
  Loader2,
  Mail,
  Search,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface SearchHit {
  id: string;
  kind: 'lead' | 'contact' | 'campaign' | 'list' | 'segment' | 'template' | 'suppression';
  title: string;
  subtitle?: string;
  href: string;
}

const KIND_ICON: Record<SearchHit['kind'], React.ComponentType<{ className?: string }>> = {
  lead: Users,
  contact: Mail,
  campaign: Send,
  list: CalendarDays,
  segment: Sparkles,
  template: ImageIcon,
  suppression: Ban,
};

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  lead: 'Lead',
  contact: 'Contact',
  campaign: 'Campaign',
  list: 'List',
  segment: 'Segment',
  template: 'Template',
  suppression: 'Suppression',
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reqRef = useRef(0);

  // Global keybinding.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus the input when opening.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    } else {
      // Reset state when closing.
      setQ('');
      setHits([]);
      setCursor(0);
    }
  }, [open]);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length === 0) {
      setHits([]); setLoading(false); return;
    }
    const myReq = ++reqRef.current;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' });
        const json = (await res.json()) as { ok?: boolean; hits?: SearchHit[] };
        if (myReq === reqRef.current) {
          setHits(json?.hits ?? []);
          setCursor(0);
        }
      } finally {
        if (myReq === reqRef.current) setLoading(false);
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const grouped = useMemo(() => {
    const map: Partial<Record<SearchHit['kind'], SearchHit[]>> = {};
    for (const h of hits) {
      const k = h.kind;
      if (!map[k]) map[k] = [];
      map[k]!.push(h);
    }
    return map;
  }, [hits]);

  const flatOrder: SearchHit['kind'][] = ['lead', 'contact', 'campaign', 'list', 'segment', 'template', 'suppression'];
  const flatHits: SearchHit[] = useMemo(() => flatOrder.flatMap((k) => grouped[k] ?? []), [grouped]);

  const navigate = useCallback((hit: SearchHit) => {
    setOpen(false);
    router.push(hit.href);
  }, [router]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(0, flatHits.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flatHits[cursor];
      if (hit) navigate(hit);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl rounded-md bg-evari-surface border border-evari-edge/40 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2.5 flex items-center gap-2 border-b border-evari-edge/30">
          <Search className="h-4 w-4 text-evari-dim" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search leads, campaigns, lists, templates..."
            className="flex-1 bg-transparent text-evari-text placeholder-evari-dimmer text-[13px] focus:outline-none"
          />
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-evari-dim" /> : null}
          <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-evari-ink/40 text-evari-dim border border-evari-edge/30 font-mono">esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-evari-dim">
              Type to search leads, contacts, campaigns, lists, segments, templates and suppressions.
            </div>
          ) : flatHits.length === 0 && !loading ? (
            <div className="px-4 py-6 text-[12px] text-evari-dim">No matches.</div>
          ) : (
            flatOrder.map((kind) => {
              const items = grouped[kind] ?? [];
              if (items.length === 0) return null;
              return (
                <div key={kind} className="py-1.5">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{KIND_LABEL[kind]}</div>
                  <ul>
                    {items.map((h) => {
                      const i = flatHits.findIndex((x) => x === h);
                      const Icon = KIND_ICON[h.kind];
                      const active = i === cursor;
                      return (
                        <li key={`${h.kind}:${h.id}`}>
                          <button
                            type="button"
                            onMouseEnter={() => setCursor(i)}
                            onClick={() => navigate(h)}
                            className={cn('w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                              active ? 'bg-evari-gold/15 text-evari-text' : 'text-evari-dim hover:bg-evari-ink/40')}
                          >
                            <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-evari-gold' : 'text-evari-dimmer')} />
                            <span className="flex-1 min-w-0">
                              <span className="block truncate text-evari-text font-medium">{h.title}</span>
                              {h.subtitle ? <span className="block truncate text-[11px] text-evari-dim">{h.subtitle}</span> : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="px-3 py-2 border-t border-evari-edge/30 flex items-center gap-3 text-[10px] text-evari-dimmer">
          <span><kbd className="px-1 py-0.5 rounded bg-evari-ink/40 border border-evari-edge/30 font-mono">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-evari-ink/40 border border-evari-edge/30 font-mono">↓</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 rounded bg-evari-ink/40 border border-evari-edge/30 font-mono">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="px-1 py-0.5 rounded bg-evari-ink/40 border border-evari-edge/30 font-mono">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
