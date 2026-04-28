'use client';

/**
 * Messaging dashboard. Reads from the brief: objective becomes the
 * value proposition prose; messaging[] populates the four key-message
 * cards (with sensible defaults if empty); successMetrics + historical
 * win rate populate the proof-points list. Tone of voice is derived
 * from the brand brief defaults today; a future iteration could
 * make this editable per play.
 */

import { useEffect, useMemo, useState } from 'react';
import { Compass, MessageCircle, Pencil, ShieldCheck, Sparkles, Target, TrendingUp, Trophy } from 'lucide-react';

import { cn } from '@/lib/utils';

interface KeyMessage { icon: React.ComponentType<{ className?: string }>; title: string; body: string }

interface Brief {
  objective: string | null;
  messaging: { angle: string; line?: string }[] | null;
  successMetrics: { name: string; target?: string }[] | null;
}

interface Analytics {
  winRateHistorical: number | null;
  reachableContacts: number;
  decisionMakerCount: number;
}

const DEFAULT_KEY_MESSAGES: KeyMessage[] = [
  { icon: Target,        title: 'Hit the right accounts',    body: 'Identify high-fit companies and decision makers most likely to buy.' },
  { icon: MessageCircle, title: 'Engage with relevance',     body: 'Personalised messages that resonate and start meaningful conversations.' },
  { icon: TrendingUp,    title: 'Drive more meetings',       body: 'Consistent outreach that increases reply rates and books more meetings.' },
  { icon: Trophy,        title: 'Win more business',         body: 'Stronger relationships and insights that accelerate deals to close.' },
];

const TONE: { label: string; value: string }[] = [
  { label: 'Tone of voice', value: 'Credible and assured' },
  { label: 'Human',         value: 'Conversational, not robotic' },
  { label: 'Relevant',      value: 'Industry-aware and specific' },
  { label: 'Concise',       value: 'Clear, direct and easy to read' },
  { label: 'Helpful',       value: 'Focused on their outcomes' },
];

export function MessagingStep({ playId, brief, onEdit }: { playId: string; brief: Brief; onEdit: () => void }) {
  const [a, setA] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setA(d?.analytics ?? null))
      .catch(() => setA(null));
  }, [playId]);

  const keyMessages: KeyMessage[] = useMemo(() => {
    const fromBrief = (brief.messaging ?? []).slice(0, 4);
    if (fromBrief.length === 0) return DEFAULT_KEY_MESSAGES;
    return fromBrief.map((m, i) => ({
      icon: DEFAULT_KEY_MESSAGES[i % 4].icon,
      title: m.angle || DEFAULT_KEY_MESSAGES[i % 4].title,
      body: m.line || DEFAULT_KEY_MESSAGES[i % 4].body,
    }));
  }, [brief.messaging]);

  // One-liner: short version of objective. Cap at first sentence.
  const valueProp = brief.objective?.trim() || 'Define the value proposition on the Brief step.';
  const oneLiner = valueProp.split(/[.!?]/)[0].trim() + (valueProp.length > 0 ? '.' : '');

  const proofPoints = (brief.successMetrics ?? []).map((m) => ({
    label: m.name || '—',
    value: m.target ?? '—',
  }));
  if (a?.winRateHistorical !== null && a?.winRateHistorical !== undefined) {
    proofPoints.push({ label: 'Historical win rate', value: `${a.winRateHistorical}%` });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-[20px] font-bold text-evari-text">Messaging</h2>
          <p className="text-[12px] text-evari-dim mt-0.5">Craft the core message and key proof points that resonate with your ideal customers.</p>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit messaging
        </button>
      </header>

      <Card title="Core message">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Value proposition</div>
            <p className="text-[13px] text-evari-text leading-relaxed">{valueProp}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">One-liner</div>
            <p className="text-[13px] text-evari-text leading-relaxed">{oneLiner}</p>
          </div>
        </div>
      </Card>

      <Card title="Key messages">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {keyMessages.map((m, i) => (
            <div key={i} className="rounded-md border border-evari-edge/30 bg-evari-ink/30 p-3">
              <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-evari-gold/15 text-evari-gold mb-2"><m.icon className="h-4 w-4" /></span>
              <div className="text-[13px] font-semibold text-evari-text">{m.title}</div>
              <p className="text-[11px] text-evari-dim mt-1 leading-relaxed">{m.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Proof points">
          {proofPoints.length === 0 ? (
            <div className="text-[11px] text-evari-dim">Add success metrics on the Brief step to surface them here as proof.</div>
          ) : (
            <ul className="divide-y divide-evari-edge/20">
              {proofPoints.map((p, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-[12px]">
                  <span className="inline-flex items-center gap-2 text-evari-text">
                    <ShieldCheck className="h-3.5 w-3.5 text-evari-gold" /> {p.label}
                  </span>
                  <span className="text-evari-gold font-semibold tabular-nums">{p.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tone of voice">
          <ul className="divide-y divide-evari-edge/20">
            {TONE.map((t) => (
              <li key={t.label} className="flex items-baseline justify-between py-2 text-[12px]">
                <span className="text-evari-dim">{t.label}</span>
                <span className="text-evari-text">{t.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text mb-3">{title}</h3>
      {children}
    </section>
  );
}
