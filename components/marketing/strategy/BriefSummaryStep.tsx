'use client';

/**
 * Market analysis stage. The first stage of the Strategy walk.
 *
 * Job of this page: answer "is this market worth pursuing?" by
 * combining two market-side chip picks (Sector + Geography) with an
 * AI-researched Market sizing card. Customer-side picks (size,
 * revenue, roles, channels) live on Target profile. Strategy drafting
 * happens later on Synopsis.
 *
 * Layout: chips on the left, Spitball as a research chat on the
 * right. Spitball has autoDraft={false} so Claude never auto-fires a
 * strategy paragraph here.
 */

import { useEffect, useState } from 'react';
import { BarChart3, Loader2, Lock, Pencil, Sparkles, Unlock } from 'lucide-react';
import { StepTitle } from './StepTitle';

import { SpitballPanel } from './SpitballPanel';
import { ChipPicker } from './ChipPicker';

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
  // Chip suggestions for this stage. Loaded once per play; the AI
  // tailors options to the pitch + idea. Locked briefs skip the
  // refetch.
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

  // Market sizing card. Re-fetches when the user changes Sector or
  // Geography because the answer materially depends on those picks.
  // Skips when locked.
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
      // Keep legacy single-string column populated (comma-joined) so
      // any older code paths that still read brief.geography stay
      // readable.
      geography: picked.length > 0 ? picked.join(', ') : null,
    });
  }

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Market analysis" />
          <p className="text-[12px] text-evari-dim mt-0.5">
            {brief.locked
              ? 'Locked. Click Unlock to refine; the AI will not redraft until you do.'
              : 'Is this market worth pursuing? Pick the sector and geography on the left. Claude researches the market on the right while you ask questions.'}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-panel">
        {/* LEFT: market-side chips + Market sizing research card. The
            full fieldset is disabled when the brief is locked. */}
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

          {/* Market sizing — AI-researched evidence that this market
              is real (or not). Hides until the user has picked
              something to research, otherwise the AI has nothing to
              go on. */}
          {brief.industries.length > 0 || brief.geographies.length > 0 || brief.geography ? (
            <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
              <h3 className="text-[13px] font-semibold text-evari-text mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">
                  <BarChart3 className="h-4 w-4" />
                </span>
                Market sizing
              </h3>
              {sizingLoading ? (
                <div className="text-[12px] text-evari-dim flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Claude is sizing the market…
                </div>
              ) : sizingError ? (
                <p className="text-[12px] text-evari-dim">Could not size this market right now. {sizingError}</p>
              ) : sizing ? (
                <div className="space-y-3">
                  <KVRow label="Size" value={sizing.marketSize || '—'} />
                  <KVRow
                    label="Competitors"
                    value={sizing.competitors.length > 0 ? sizing.competitors.join(', ') : '—'}
                  />
                  <KVRow
                    label="Buyer language"
                    value={sizing.buyerTerminology.length > 0 ? sizing.buyerTerminology.map((t) => `"${t}"`).join(', ') : '—'}
                  />
                  <KVRow
                    label="Intent signals"
                    value={sizing.intentSignals.length > 0 ? sizing.intentSignals.join(', ') : '—'}
                  />
                </div>
              ) : (
                <p className="text-[12px] text-evari-dim">Pick a sector or geography to size this market.</p>
              )}
            </section>
          ) : null}
        </fieldset>

        {/* RIGHT: Spitball as a research chat. autoDraft={false} so
            Claude never auto-fires a strategy paragraph here. */}
        <div className="rounded-panel overflow-hidden border border-evari-edge/30 bg-evari-ink min-h-[600px] flex">
          <SpitballPanel
            playId={playId}
            playTitle={playTitle}
            pitch={pitch}
            open={true}
            kickoff={false}
            compact
            locked={brief.locked}
            autoDraft={false}
            onClose={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline text-[12px]">
      <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</span>
      <span className="text-evari-text leading-relaxed break-words">{value}</span>
    </div>
  );
}
