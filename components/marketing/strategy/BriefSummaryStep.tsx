'use client';

/**
 * Market analysis stage. The first stage of the Strategy walk.
 *
 * One job: answer "is this market worth pursuing?" with a glance, not
 * a read. Sector + Geography chips on the left, a hero stats strip
 * (market size, competitor count, intent strength), and the AI-
 * researched Market sizing card with verdict-style framing.
 *
 * No Spitball here. Conversational refinement lives in the global
 * AI Assistant pane on the right of the app.
 */

import { useEffect, useState } from 'react';
import { BarChart3, Loader2, Lock, Pencil, TrendingUp, Unlock } from 'lucide-react';
import { StepTitle } from './StepTitle';

import { ChipPicker } from './ChipPicker';
import { cn } from '@/lib/utils';

interface Brief {
  campaignName: string | null;
  objective: string | null;
  targetAudience: string[];
  geography: string | null;
  geographies: string[];
  industries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  companySizes: string[];
  revenueMin: string | null;
  revenueMax: string | null;
  revenues: string[];
  channels: string[];
  messaging: { angle: string; line?: string }[] | null;
  successMetrics: { name: string; target?: string }[] | null;
  idealCustomer: string | null;
  synopsisText: string | null;
  locked: boolean;
}

interface MarketSizing {
  marketSize: string;
  competitors: string[];
  buyerTerminology: string[];
  intentSignals: string[];
}

export function BriefSummaryStep({
  playId,
  brief,
  onEdit,
  playTitle,
  pitch,
  onPatch,
}: {
  playId: string;
  brief: Brief;
  onEdit: () => void;
  playTitle: string;
  pitch: string;
  onPatch: (patch: Partial<Brief>) => void;
}) {
  const [chips, setChips] = useState<{ industries: string[]; geographies: string[] } | null>(null);
  const [chipsLoading, setChipsLoading] = useState(true);
  useEffect(() => {
    if (brief.locked) {
      setChipsLoading(false);
      return;
    }
    let cancelled = false;
    setChipsLoading(true);
    fetch(`/api/strategy/${playId}/chips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: 'market', playTitle, pitch }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok) {
          setChips({
            industries: Array.isArray(d.industries) ? d.industries : [],
            geographies: Array.isArray(d.geographies) ? d.geographies : [],
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChipsLoading(false); });
    return () => { cancelled = true; };
  }, [playId, playTitle, pitch, brief.locked]);

  const [sizing, setSizing] = useState<MarketSizing | null>(null);
  const [sizingLoading, setSizingLoading] = useState(false);
  const [sizingError, setSizingError] = useState<string | null>(null);
  const industriesKey = brief.industries.join('|');
  const geographiesKey = (brief.geographies.length > 0 ? brief.geographies : (brief.geography ? brief.geography.split(/,\s*/) : [])).join('|');
  useEffect(() => {
    if (brief.locked) return;
    if (brief.industries.length === 0 && brief.geographies.length === 0 && !brief.geography) {
      setSizing(null);
      return;
    }
    let cancelled = false;
    setSizingLoading(true);
    setSizingError(null);
    fetch(`/api/strategy/${playId}/market-sizing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playTitle,
        pitch,
        industries: brief.industries,
        geographies: brief.geographies.length > 0 ? brief.geographies : (brief.geography ? brief.geography.split(/,\s*/).filter(Boolean) : []),
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok) {
          setSizing({
            marketSize: typeof d.marketSize === 'string' ? d.marketSize : '',
            competitors: Array.isArray(d.competitors) ? d.competitors : [],
            buyerTerminology: Array.isArray(d.buyerTerminology) ? d.buyerTerminology : [],
            intentSignals: Array.isArray(d.intentSignals) ? d.intentSignals : [],
          });
        } else {
          setSizingError(typeof d?.error === 'string' ? d.error : 'Could not load market sizing');
        }
      })
      .catch((e) => { if (!cancelled) setSizingError((e as Error).message); })
      .finally(() => { if (!cancelled) setSizingLoading(false); });
    return () => { cancelled = true; };
  }, [playId, playTitle, pitch, industriesKey, geographiesKey, brief.industries.length, brief.geographies.length, brief.geography, brief.locked]);

  function applyGeographies(picked: string[]) {
    onPatch({
      geographies: picked,
      geography: picked.length > 0 ? picked.join(', ') : null,
    });
  }

  const hasPicks = brief.industries.length > 0 || brief.geographies.length > 0 || !!brief.geography;
  const competitorCount = sizing?.competitors.length ?? 0;
  const intentCount = sizing?.intentSignals.length ?? 0;
  const verdict = !hasPicks
    ? { tone: 'idle', label: 'Not enough to size yet' }
    : sizingLoading
      ? { tone: 'idle', label: 'Sizing…' }
      : sizing && sizing.marketSize
        ? (intentCount >= 2 && competitorCount > 0
          ? { tone: 'good', label: 'Worth pursuing' }
          : { tone: 'maybe', label: 'Pursue with caution' })
        : { tone: 'idle', label: 'Awaiting analysis' };

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Market analysis" />
          <p className="text-[12px] text-evari-dim mt-0.5">
            {brief.locked
              ? 'Locked. Click Unlock to refine; the AI will not redraft until you do.'
              : 'Is this market worth pursuing? Pick the sector and geography, then read the verdict.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPatch({ locked: !brief.locked })}
          className={brief.locked
            ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold border border-evari-gold/40 hover:bg-evari-gold/25 transition'
            : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-surface text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition'}
          title={brief.locked ? 'Unlock to allow AI to refine again' : 'Lock the brief so the AI will not redraft on revisit'}
        >
          {brief.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {brief.locked ? 'Unlock' : 'Lock'}
        </button>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-text text-evari-ink hover:brightness-110 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit brief
        </button>
      </header>

      {/* Hero stats strip — answer the question at a glance. */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-panel items-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Verdict</div>
            <VerdictPill tone={verdict.tone as 'good' | 'maybe' | 'idle'} label={verdict.label} />
          </div>
          <Hero
            label="Market size"
            value={sizingLoading ? '…' : (sizing?.marketSize ? truncateNumberish(sizing.marketSize) : '—')}
            sub={sizing?.marketSize && sizing.marketSize.length > 60 ? 'Estimate' : undefined}
          />
          <Hero
            label="Competitors"
            value={hasPicks && !sizingLoading ? String(competitorCount) : '—'}
            sub={hasPicks && competitorCount > 0 ? sizing?.competitors.slice(0, 2).join(', ') : 'Direct rivals'}
          />
          <Hero
            label="Intent signals"
            value={hasPicks && !sizingLoading ? String(intentCount) : '—'}
            sub={hasPicks && intentCount > 0 ? 'Things to watch' : 'Buying triggers'}
          />
        </div>
      </section>

      {/* Two-column: chips on left, market detail on right. No more
          Spitball; the global AI Assistant pane handles conversation. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-panel">
        <fieldset disabled={brief.locked} className={brief.locked ? 'flex flex-col gap-panel opacity-70 pointer-events-none' : 'flex flex-col gap-panel'}>
          <ChipPicker
            title="Sector"
            hint="Which industries are we targeting?"
            options={chips?.industries ?? []}
            selected={brief.industries}
            onChange={(next) => onPatch({ industries: next })}
            loading={chipsLoading}
          />
          <ChipPicker
            title="Geography"
            hint="Where are these companies based? Pick as many as you like."
            options={chips?.geographies ?? []}
            selected={brief.geographies.length > 0 ? brief.geographies : (brief.geography ? brief.geography.split(/,\s*/).filter(Boolean) : [])}
            onChange={applyGeographies}
            loading={chipsLoading}
          />
        </fieldset>

        {/* Market detail — competitors as chips, buyer phrases as
            quoted callouts, intent signals as a list. */}
        <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4 space-y-4">
          <h3 className="text-[13px] font-semibold text-evari-text flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">
              <BarChart3 className="h-4 w-4" />
            </span>
            Market detail
          </h3>

          {!hasPicks ? (
            <p className="text-[12px] text-evari-dim">Pick a sector or geography on the left to size this market.</p>
          ) : sizingLoading ? (
            <div className="text-[12px] text-evari-dim flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Claude is sizing the market…
            </div>
          ) : sizingError ? (
            <p className="text-[12px] text-evari-dim">Could not size this market right now. {sizingError}</p>
          ) : sizing ? (
            <div className="space-y-4">
              {sizing.marketSize ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Size estimate</div>
                  <p className="text-[12px] text-evari-text leading-relaxed">{sizing.marketSize}</p>
                </div>
              ) : null}
              {sizing.competitors.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Competitors</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sizing.competitors.map((c) => (
                      <span key={c} className="inline-flex items-center px-2 py-1 rounded-md bg-evari-ink text-[11px] text-evari-text border border-evari-edge/30">{c}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {sizing.buyerTerminology.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Buyer language</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sizing.buyerTerminology.map((t) => (
                      <span key={t} className="inline-flex items-center px-2 py-1 rounded-md bg-evari-gold/10 text-[11px] text-evari-gold italic">"{t}"</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {sizing.intentSignals.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" /> Intent signals
                  </div>
                  <ul className="space-y-1 text-[12px] text-evari-text">
                    {sizing.intentSignals.map((s, i) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span className="text-evari-gold font-mono tabular-nums shrink-0">{i + 1}.</span>
                        <span className="leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Hero({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className="text-[26px] font-bold tabular-nums text-evari-text mt-0.5 leading-tight truncate" title={value}>{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim truncate">{sub}</div> : null}
    </div>
  );
}

function VerdictPill({ tone, label }: { tone: 'good' | 'maybe' | 'idle'; label: string }) {
  const cls =
    tone === 'good' ? 'bg-evari-success/15 text-evari-success border-evari-success/30' :
    tone === 'maybe' ? 'bg-evari-warn/15 text-evari-warn border-evari-warn/30' :
    'bg-evari-ink/40 text-evari-dim border-evari-edge/30';
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border mt-1', cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5" />
      {label}
    </span>
  );
}

function truncateNumberish(s: string): string {
  // Pull out the first number-ish token if the AI sent prose; fall
  // back to the whole string capped to 18 chars for the hero slot.
  const m = s.match(/£?\$?€?\d[\d.,]*\s*[BMK]?/i);
  if (m) return m[0].trim();
  return s.length > 18 ? s.slice(0, 18) + '…' : s;
}
