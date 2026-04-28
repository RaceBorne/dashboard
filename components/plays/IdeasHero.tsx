'use client';

/**
 * Hero banner at the top of /ideas. Three big AI cards. Click one and
 * Claude returns five concrete idea proposals (title + pitch) that the
 * operator can one-click into real Play rows. Each "Pursue" runs the
 * same code path as the manual New Idea modal: POST /api/plays then
 * route to /strategy?playId=X&kickoff=1.
 *
 * The previous version of this component just sent a prompt to the AI
 * Assistant pane on the right, which surfaced a chat reply nobody could
 * act on. This version closes the loop: AI suggestion → real idea row →
 * Spitball with kickoff = creating a venture in roughly 10 seconds.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/utils';

type Kind = 'generate' | 'refine' | 'analyse';

interface IdeaSuggestion {
  title: string;
  pitch: string;
  why: string;
}

const KIND_META: Record<Kind, { title: string; subtitle: string; Icon: typeof Sparkles }> = {
  generate: { title: 'Generate new ideas',   subtitle: 'Five fresh targets from Claude', Icon: Sparkles },
  refine:   { title: 'Refine existing ideas', subtitle: 'Sharper variations of what works', Icon: RefreshCw },
  analyse:  { title: 'Analyse a market',      subtitle: 'Segment-by-segment breakdown', Icon: LineChart },
};

export function IdeasHero() {
  const router = useRouter();
  const [greeting, setGreeting] = useState('Hello');
  const [hidden, setHidden] = useState(false);
  const [activeKind, setActiveKind] = useState<Kind | null>(null);
  const [suggestions, setSuggestions] = useState<IdeaSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adoptingIndex, setAdoptingIndex] = useState<number | null>(null);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting('Good morning');
    else if (h < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  async function fetchSuggestions(kind: Kind) {
    setActiveKind(kind);
    setSuggestions([]);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/ideas/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'AI request failed');
        return;
      }
      const ideas = Array.isArray(json.ideas) ? (json.ideas as IdeaSuggestion[]) : [];
      setSuggestions(ideas);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function adopt(suggestion: IdeaSuggestion, idx: number) {
    setAdoptingIndex(idx);
    try {
      const res = await fetch('/api/plays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: suggestion.title, brief: suggestion.pitch }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json.id) {
        setError(json?.error ?? 'Failed to create idea');
        setAdoptingIndex(null);
        return;
      }
      // Best-effort seed of strategyShort so Discover has context the
      // moment Spitball commits.
      void fetch(`/api/plays/${json.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strategyShort: suggestion.pitch }),
      }).catch(() => {});
      router.push(`/strategy?playId=${json.id}&kickoff=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAdoptingIndex(null);
    }
  }

  if (hidden) return null;

  return (
    <section className="rounded-panel bg-evari-surface border border-evari-gold/20 p-4 mb-4 relative">
      <button type="button" onClick={() => setHidden(true)} className="absolute top-2 right-2 text-evari-dim hover:text-evari-text p-1 rounded transition" title="Hide for this session">
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 mb-3">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-evari-gold/15 text-evari-gold shrink-0">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-evari-text">{greeting}, Maddog.</h2>
          <p className="text-[12px] text-evari-dim mt-0.5">Pick a starting point and Claude will propose five concrete ideas to pursue.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(KIND_META) as Kind[]).map((k) => {
          const meta = KIND_META[k];
          const Icon = meta.Icon;
          const isActive = activeKind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => void fetchSuggestions(k)}
              disabled={loading}
              className={cn(
                'group rounded-md border bg-evari-ink/30 transition p-3 text-left',
                isActive
                  ? 'border-evari-gold bg-evari-gold/10'
                  : 'border-evari-edge/30 hover:border-evari-gold hover:bg-evari-gold/5',
                loading ? 'opacity-50 cursor-wait' : '',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">
                  {loading && isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="text-[12px] font-semibold text-evari-text">{meta.title}</span>
              </div>
              <p className="text-[11px] text-evari-dim">{meta.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* Results panel: shows below the cards once Claude returns. */}
      {(activeKind && (loading || suggestions.length > 0 || error)) ? (
        <div className="mt-3 rounded-md border border-evari-edge/30 bg-evari-ink/30 p-2">
          {loading ? (
            <div className="flex items-center gap-2 text-[12px] text-evari-dim px-1 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Claude is thinking…
            </div>
          ) : null}

          {error ? (
            <div className="text-[12px] text-evari-danger px-1 py-2">
              {error}
            </div>
          ) : null}

          {suggestions.length > 0 ? (
            <ul className="space-y-1.5">
              {suggestions.map((s, i) => {
                const adopting = adoptingIndex === i;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-evari-surface border border-evari-edge/30 p-2.5 hover:border-evari-gold/40 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-evari-text leading-tight">{s.title}</div>
                      <p className="text-[12px] text-evari-dim mt-0.5">{s.pitch}</p>
                      {s.why ? (
                        <p className="text-[11px] text-evari-dimmer mt-1 italic">Why: {s.why}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void adopt(s, i)}
                      disabled={adoptingIndex !== null}
                      className={cn(
                        'shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition',
                        'bg-evari-gold text-evari-goldInk hover:brightness-110',
                        adopting ? 'opacity-70 cursor-wait' : '',
                        adoptingIndex !== null && !adopting ? 'opacity-50' : '',
                      )}
                    >
                      {adopting ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Creating…
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" /> Pursue
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
