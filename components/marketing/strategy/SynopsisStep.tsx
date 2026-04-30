'use client';

/**
 * Synopsis stage — third stage of the Strategy walk.
 *
 * Locked-on-arrival: if a synopsisText is already cached on the brief
 * we render it without an AI call. The user must explicitly Unlock +
 * Regenerate to spend tokens. This protects against accidental
 * re-spend when the page is revisited.
 */

import { useState } from 'react';
import { Lock, Loader2, Pencil, Sparkles, Unlock } from 'lucide-react';
import { StepTitle } from './StepTitle';
import { humaniseChannel } from './BriefEditorDrawer';

interface Brief {
  campaignName: string | null;
  objective: string | null;
  targetAudience: string[];
  geography: string | null;
  geographies?: string[];
  industries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  companySizes?: string[];
  revenueMin: string | null;
  revenueMax: string | null;
  revenues?: string[];
  channels: string[];
  messaging: { angle: string; line?: string }[] | null;
  successMetrics: { name: string; target?: string }[] | null;
  idealCustomer: string | null;
  synopsisText: string | null;
  locked: boolean;
}

interface Props {
  playId: string;
  playTitle: string;
  pitch: string;
  brief: Brief;
  onEdit: () => void;
  onPatch: (patch: Partial<Brief>) => void;
}

export function SynopsisStep({ playId, playTitle, pitch, brief, onEdit, onPatch }: Props) {
  const [loading, setLoading] = useState(false);

  // The synopsis paragraph comes from the cached field on the brief.
  // No useEffect, no auto-regeneration. The user explicitly clicks
  // Regenerate to spend an AI call.
  const text = brief.synopsisText && brief.synopsisText.trim().length > 0
    ? brief.synopsisText
    : fallbackSynopsis(brief);

  async function regenerate() {
    if (brief.locked) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/strategy/${playId}/synopsis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief, pitch, playTitle }),
      });
      const d = await res.json();
      if (d?.ok && typeof d.synopsis === 'string') {
        // Persist to the brief so subsequent visits read from cache.
        onPatch({ synopsisText: d.synopsis });
      }
    } catch {
      // Fall back to the canned synthesise() output on the page.
    } finally {
      setLoading(false);
    }
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lead = sentences.slice(0, Math.min(2, sentences.length)).join(' ');
  const rest = sentences.slice(2).join(' ');

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Synopsis" />
          <p className="text-[12px] text-evari-dim mt-0.5">
            {brief.locked
              ? 'Locked. Click Unlock if you want to regenerate this synopsis.'
              : 'The strategy in one read. Click Regenerate if you want a fresh take after editing the brief.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPatch({ locked: !brief.locked })}
          className={brief.locked
            ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold/15 text-evari-gold border border-evari-gold/40 hover:bg-evari-gold/25 transition'
            : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-surface text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition'}
          title={brief.locked ? 'Unlock to regenerate' : 'Lock so the AI cannot redraft on revisit'}
        >
          {brief.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {brief.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={brief.locked || loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-surface text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 disabled:opacity-50 disabled:cursor-not-allowed transition"
          title={brief.locked ? 'Unlock first' : 'Regenerate the synopsis'}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Regenerate
        </button>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-text text-evari-ink hover:brightness-110 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit fields
        </button>
      </header>

      {/* Big lead paragraph — the headline. Then the rest in calmer
          type. Then a quick-scan facts strip. No more two-column
          chat layout; the AI Assistant pane on the right of the app
          is for back-and-forth refinement. */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-evari-dimmer mb-3">
          <Sparkles className="h-3 w-3 text-evari-gold" />
          <span>Strategy synopsis</span>
        </div>
        {loading && !brief.synopsisText ? (
          <div className="text-[12px] text-evari-dim flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Claude is writing…
          </div>
        ) : (
          <>
            <p className="text-[18px] text-evari-text leading-relaxed font-semibold">{lead}</p>
            {rest ? <p className="text-[14px] text-evari-text leading-relaxed mt-3">{rest}</p> : null}
          </>
        )}
      </section>

      {/* Quick-scan facts. Three columns, decision-grade summary. */}
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-panel">
          <Fact label="Sector" value={brief.industries.length > 0 ? brief.industries.join(', ') : '—'} />
          <Fact label="Geography" value={brief.geographies && brief.geographies.length > 0 ? brief.geographies.join(', ') : (brief.geography ?? '—')} />
          <Fact label="Channels" value={brief.channels.length > 0 ? brief.channels.map(humaniseChannel).join(', ') : '—'} />
          <Fact label="Roles" value={brief.targetAudience.length > 0 ? brief.targetAudience.join(', ') : '—'} />
          <Fact label="Top angle" value={brief.messaging?.[0]?.angle ?? '—'} />
          <Fact label="Pitch" value={pitch} />
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">{label}</div>
      <div className="text-[12px] text-evari-text leading-relaxed break-words">{value}</div>
    </div>
  );
}

function fallbackSynopsis(b: Brief): string {
  const parts: string[] = [];
  if (b.industries.length > 0) {
    parts.push(`We are hunting ${b.industries.join(', ')}${b.geography ? ` in ${b.geography}` : ''}.`);
  }
  if (b.targetAudience.length > 0) {
    parts.push(`The roles we email are ${b.targetAudience.join(', ')}.`);
  }
  if (b.companySizeMin && b.companySizeMax) {
    parts.push(`Companies of ${b.companySizeMin} to ${b.companySizeMax} employees.`);
  }
  if (b.channels.length > 0) {
    parts.push(`Channels: ${b.channels.map(humaniseChannel).join(', ')}.`);
  }
  if (b.messaging && b.messaging.length > 0) {
    parts.push(`Lead angle: ${b.messaging[0].angle}.`);
  }
  if (b.idealCustomer) {
    parts.push(b.idealCustomer);
  }
  if (parts.length === 0) {
    return 'Pick a sector and geography on Market analysis, then click Regenerate to write the synopsis.';
  }
  return parts.join(' ');
}
