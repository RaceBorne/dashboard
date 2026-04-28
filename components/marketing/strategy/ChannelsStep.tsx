'use client';

/**
 * Channels dashboard. Heuristic effectiveness/effort/priority based
 * on the audience (decision-maker mix from analytics) and the
 * channels currently picked in the brief. Edit list lives in the
 * brief drawer; this view is read-only with an explicit Edit affordance.
 */

import { useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { StepTitle } from './StepTitle';

import { cn } from '@/lib/utils';

interface ChannelRow {
  key: string;
  label: string;
  effectiveness: number; // 0..100
  effort: 'Low' | 'Medium' | 'High';
  priority: 'Low' | 'Medium' | 'High';
  howWeUseIt: string;
  bestFor: string;
}

interface Analytics {
  decisionMakers: { key: string; label: string; count: number; pct: number }[];
  reachableContacts: number;
}

const DETAILS: Record<string, Pick<ChannelRow, 'howWeUseIt' | 'bestFor'> & { baseEffectiveness: number; effort: ChannelRow['effort'] }> = {
  email: { howWeUseIt: 'Personalised outreach and follow-ups to start conversations and drive meetings.', bestFor: 'Decision makers (Directors, VP, C-Level)', baseEffectiveness: 78, effort: 'Low' },
  linkedin_organic: { howWeUseIt: 'Build awareness and engage through content and direct connection.', bestFor: 'Early-stage research and relationship building', baseEffectiveness: 76, effort: 'Low' },
  linkedin_paid: { howWeUseIt: 'Targeted outreach and retargeting to high-fit accounts.', bestFor: 'Pipeline acceleration and brand visibility', baseEffectiveness: 64, effort: 'Medium' },
  phone: { howWeUseIt: 'Direct conversations to qualify interest and move opportunities forward.', bestFor: 'Warm leads and high-intent prospects', baseEffectiveness: 60, effort: 'Medium' },
  event: { howWeUseIt: 'Share expertise, generate pipeline and build trust at scale.', bestFor: 'Thought leadership and account nurturing', baseEffectiveness: 50, effort: 'High' },
  website: { howWeUseIt: 'Capture inbound interest from organic and paid traffic.', bestFor: 'Late-funnel buyers comparing options', baseEffectiveness: 55, effort: 'Medium' },
  social: { howWeUseIt: 'Brand visibility through Instagram, X and TikTok.', bestFor: 'Top-of-funnel reach and community', baseEffectiveness: 45, effort: 'Medium' },
};

const LABELS: Record<string, string> = {
  email: 'Email',
  linkedin_organic: 'LinkedIn (Organic)',
  linkedin_paid: 'LinkedIn (Paid)',
  phone: 'Phone',
  event: 'Events & Webinars',
  website: 'Website',
  social: 'Social',
};

function priorityFor(score: number): ChannelRow['priority'] {
  if (score >= 70) return 'High';
  if (score >= 50) return 'Medium';
  return 'Low';
}

export function ChannelsStep({ playId, briefChannels, onEdit }: { playId: string; briefChannels: string[]; onEdit: () => void }) {
  const [a, setA] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch(`/api/strategy/${playId}/analytics`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setA(d?.analytics ?? null))
      .catch(() => setA(null));
  }, [playId]);

  // Bias: if the audience is dominated by C-Level/VP, push email/LinkedIn organic up; if heavy on managers, lower phone.
  const cLevelPct = (a?.decisionMakers ?? []).find((d) => d.key === 'c_level')?.pct ?? 0;
  const headPct = (a?.decisionMakers ?? []).find((d) => d.key === 'head')?.pct ?? 0;

  const rows: ChannelRow[] = (briefChannels.length > 0 ? briefChannels : Object.keys(DETAILS)).map((key) => {
    const d = DETAILS[key];
    if (!d) {
      return { key, label: LABELS[key] ?? key, effectiveness: 50, effort: 'Medium' as const, priority: 'Medium' as const, howWeUseIt: '—', bestFor: '—' };
    }
    let eff = d.baseEffectiveness;
    if (key === 'email' || key === 'linkedin_organic') eff += Math.min(15, Math.round(cLevelPct / 4));
    if (key === 'phone') eff -= Math.min(10, Math.round(headPct / 4));
    eff = Math.max(0, Math.min(100, eff));
    return {
      key,
      label: LABELS[key] ?? key,
      effectiveness: eff,
      effort: d.effort,
      priority: priorityFor(eff),
      howWeUseIt: d.howWeUseIt,
      bestFor: d.bestFor,
    };
  }).sort((a, b) => b.effectiveness - a.effectiveness);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <div className="flex-1">
          <StepTitle substep="Channels" />
          <p className="text-[12px] text-evari-dim mt-0.5">Select the channels that will reach and engage our ideal customers.</p>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition">
          <Pencil className="h-3.5 w-3.5" /> Edit selection
        </button>
      </header>

      <Card title="Channel mix" subtitle="Recommended mix based on where your ideal customers are most active and receptive.">
        {a === null ? <Loading /> : (
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
              <tr>
                <th className="text-left py-2">Channel</th>
                <th className="text-left py-2">Effectiveness</th>
                <th className="text-left py-2">Effort</th>
                <th className="text-left py-2">Priority</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-evari-edge/20">
                  <td className="py-2.5 text-evari-text font-medium">{r.label}</td>
                  <td className="py-2.5 pr-4 w-[40%]">
                    <div className="h-1.5 rounded-full bg-evari-edge/30 overflow-hidden">
                      <div className="h-full rounded-full bg-evari-gold" style={{ width: `${r.effectiveness}%` }} />
                    </div>
                  </td>
                  <td className="py-2.5 text-evari-dim">{r.effort}</td>
                  <td className="py-2.5"><PriorityPill p={r.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Channel details" subtitle="How we will use each channel across the buyer journey.">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
            <tr>
              <th className="text-left py-2">Channel</th>
              <th className="text-left py-2">How we'll use it</th>
              <th className="text-left py-2">Best for</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-evari-edge/20">
                <td className="py-2.5 text-evari-text font-medium align-top">{r.label}</td>
                <td className="py-2.5 text-evari-dim align-top max-w-[40ch]">{r.howWeUseIt}</td>
                <td className="py-2.5 text-evari-dim align-top">{r.bestFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
      <h3 className="text-[13px] font-semibold text-evari-text">{title}</h3>
      {subtitle ? <p className="text-[11px] text-evari-dim mt-0.5 mb-3">{subtitle}</p> : <div className="h-3" />}
      {children}
    </section>
  );
}

function PriorityPill({ p }: { p: 'Low' | 'Medium' | 'High' }) {
  const cls = p === 'High' ? 'bg-evari-gold/15 text-evari-gold' : p === 'Medium' ? 'bg-evari-warn/15 text-evari-warn' : 'bg-evari-ink/40 text-evari-dim';
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', cls)}>{p}</span>;
}

function Loading() {
  return <div className="text-[12px] text-evari-dim flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...</div>;
}
