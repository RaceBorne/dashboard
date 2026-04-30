'use client';

/**
 * Synopsis stage. Synthesises Market analysis + Target into a single
 * narrative summary the operator can refine via Spitball before the
 * final Handover document. Two-column layout: synopsis on the left,
 * Spitball with Claude on the right (compact mode).
 */

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Sparkles } from 'lucide-react';
import { StepTitle } from './StepTitle';
import { SpitballPanel } from './SpitballPanel';
import { humaniseChannel } from './BriefEditorDrawer';

interface Brief {
  campaignName: string | null;
  objective: string | null;
  targetAudience: string[];
  geography: string | null;
  industries: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  revenueMin: string | null;
  revenueMax: string | null;
  channels: string[];
  messaging: { angle: string; line?: string }[] | null;
  successMetrics: { name: string; target?: string }[] | null;
  idealCustomer: string | null;
}

interface Props {
  playId: string;
  playTitle: string;
  pitch: string;
  brief: Brief;
  onEdit: () => void;
}

export function SynopsisStep({ playId, playTitle, pitch, brief, onEdit }: Props) {
  const [aiSynopsis, setAiSynopsis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/strategy/${playId}/synopsis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief, pitch, playTitle }),
      });
      const d = await res.json();
      if (d?.ok && typeof d.synopsis === 'string') setAiSynopsis(d.synopsis);
    } catch {
      // fallback prose covers it
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void generate();
    // Regenerate when major fields change. We deliberately don't fire
    // on every keystroke; the brief editor debounces so this fires at
    // most every ~1s while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playId, brief.campaignName, brief.objective, brief.industries.join('|'), brief.geography, brief.idealCustomer]);

  // Fallback synopsis if AI is offline: stitch the brief fields
  // together as a readable paragraph. This keeps the page useful even
  // when the gateway is down.
  const fallback = synthesise(brief);
  const text = aiSynopsis ?? fallback;

  return (
    <div className="space-y-panel">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Synopsis" />
          <p className="text-[12px] text-evari-dim mt-0.5">The strategy in one read. Claude folds Market analysis and Target profile into a single paragraph you could email a co-founder.</p>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit fields
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-panel">
        {/* LEFT: AI-generated synopsis */}
        <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-5 min-h-[600px]">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[13px] font-semibold text-evari-text flex items-center gap-2 flex-1">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">
                <Sparkles className="h-4 w-4" />
              </span>
              Strategy synopsis
            </h3>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-evari-dim hover:text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 disabled:opacity-50 transition"
              title="Ask Claude to write a fresh synopsis"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Regenerate
            </button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-[12px] text-evari-dim">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Claude is synthesising the brief…
            </div>
          ) : (
            <p className="text-[14px] text-evari-text leading-relaxed whitespace-pre-wrap">{text}</p>
          )}

          {/* Pertinent points block — quick-scan summary of the
              decisions baked into the synopsis above. */}
          <div className="mt-5 pt-4 border-t border-evari-edge/30 space-y-2 text-[12px]">
            <Point label="Pitch" value={pitch} />
            <Point label="Sector" value={brief.industries.join(', ') || '—'} />
            <Point label="Geography" value={brief.geography || '—'} />
            <Point label="Channels" value={brief.channels.length > 0 ? brief.channels.map(humaniseChannel).join(', ') : '—'} />
            <Point label="Top angle" value={brief.messaging?.[0]?.angle ?? '—'} />
          </div>
        </section>

        {/* RIGHT: Spitball with Claude in compact mode */}
        <div className="rounded-panel overflow-hidden border border-evari-edge/30 bg-evari-ink min-h-[600px] flex">
          <SpitballPanel
            playId={playId}
            playTitle={playTitle}
            pitch={pitch}
            open={true}
            kickoff={false}
            compact
            autoDraft={false}
            onClose={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

function Point({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 items-baseline">
      <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</span>
      <span className="text-evari-text">{value}</span>
    </div>
  );
}

function synthesise(b: Brief): string {
  const parts: string[] = [];
  if (b.campaignName) parts.push(`This is the ${b.campaignName} play.`);
  if (b.objective) parts.push(b.objective);
  if (b.industries.length > 0) parts.push(`We target ${b.industries.join(', ')}${b.geography ? ` in ${b.geography}` : ''}.`);
  if (b.companySizeMin && b.companySizeMax) parts.push(`Companies of ${b.companySizeMin} to ${b.companySizeMax} employees.`);
  if (b.targetAudience.length > 0) parts.push(`We talk to ${b.targetAudience.join(', ')}.`);
  if (b.channels.length > 0) parts.push(`Channels: ${b.channels.map(humaniseChannel).join(', ')}.`);
  if (b.messaging && b.messaging.length > 0) parts.push(`Lead angle: ${b.messaging[0].angle}.`);
  if (b.successMetrics && b.successMetrics.length > 0) parts.push(`Success looks like ${b.successMetrics.map((m) => m.target ?? m.name).join(', ')}.`);
  if (b.idealCustomer) parts.push(b.idealCustomer);
  if (parts.length === 0) return 'Add brief fields and Claude will generate a synopsis.';
  return parts.join(' ');
}
