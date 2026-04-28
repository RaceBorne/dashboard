'use client';

/**
 * First-screen chooser on /email/campaigns/new — pick the kind of
 * email being sent before any compose work begins. The two paths
 * map to genuinely different products:
 *
 *   newsletter -> CampaignWizard (4 steps, visual block builder,
 *                  templates, designed broadcasts)
 *   direct     -> DirectComposer (3 steps, plain text + auto
 *                  signature + footer, written like Gmail)
 *
 * Same recipient pipeline, suppressions, scheduler underneath —
 * only the compose surface differs. The choice is persisted on the
 * campaign as `kind` so analytics can split open + reply rates fairly
 * (direct messages typically open MUCH higher than broadcasts).
 */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileText, Mail, Sparkles, ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CampaignKind, Group, MarketingBrand, Segment } from '@/lib/marketing/types';
import type { EmailTemplate } from '@/lib/marketing/templates';
import { CampaignWizard } from './CampaignWizard';
import { DirectComposer } from './DirectComposer';

interface Props {
  groups: Group[];
  segments: Segment[];
  templates: EmailTemplate[];
  brand: MarketingBrand;
  initialRecipientEmails?: string[];
  /** Optional seed: if /campaigns/new?kind=direct lands, skip the chooser. */
  seedKind?: CampaignKind | null;
}

export function CampaignKindChooser({ groups, segments, templates, brand, initialRecipientEmails = [], seedKind = null }: Props) {
  const [kind, setKind] = useState<CampaignKind | null>(seedKind);

  if (kind === 'newsletter') {
    return (
      <CampaignWizard
        groups={groups}
        segments={segments}
        templates={templates}
        brand={brand}
        initialRecipientEmails={initialRecipientEmails}
      />
    );
  }
  if (kind === 'direct') {
    return (
      <DirectComposer
        groups={groups}
        segments={segments}
        brand={brand}
        initialRecipientEmails={initialRecipientEmails}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/email/campaigns" className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text transition-colors mb-6">
          <ChevronLeft className="h-3.5 w-3.5" /> All campaigns
        </Link>

        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-evari-text">What are you sending?</h1>
          <p className="text-[13px] text-evari-dim mt-2">Pick the right starting point. Both end up in the inbox the same way; the compose surface and the analytics expectations differ.</p>
        </header>

        <div className="grid grid-cols-2 gap-4">
          <KindCard
            onClick={() => setKind('newsletter')}
            icon={<Sparkles className="h-6 w-6" />}
            title="Newsletter"
            tagline="Designed, branded broadcast"
            features={[
              'Visual block builder with templates',
              'Images, columns, buttons, splits',
              'For launches, weekly updates, big announcements',
            ]}
            cta="Open the wizard"
            accent="gold"
          />
          <KindCard
            onClick={() => setKind('direct')}
            icon={<Mail className="h-6 w-6" />}
            title="Direct message"
            tagline="Personal text-based email"
            features={[
              'Subject + greeting + body, like Gmail',
              'Auto-applies your signature + footer',
              'For outreach, follow-ups, short notes',
            ]}
            cta="Quick compose"
            accent="ink"
          />
        </div>

        <p className="text-[11px] text-evari-dimmer text-center mt-6">
          Tip: you can also send a direct message to one person directly from a Lead detail without coming here.
        </p>
      </div>
    </div>
  );
}

function KindCard({ onClick, icon, title, tagline, features, cta, accent }: { onClick: () => void; icon: React.ReactNode; title: string; tagline: string; features: string[]; cta: string; accent: 'gold' | 'ink' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-md border p-5 text-left transition-all hover:scale-[1.01] hover:shadow-xl',
        accent === 'gold'
          ? 'border-evari-gold/40 bg-evari-gold/5 hover:border-evari-gold hover:bg-evari-gold/10'
          : 'border-evari-edge/30 bg-evari-surface hover:border-evari-gold/40',
      )}
    >
      <div className={cn('inline-flex items-center justify-center h-10 w-10 rounded-lg mb-3', accent === 'gold' ? 'bg-evari-gold/20 text-evari-gold' : 'bg-evari-ink/60 text-evari-dim')}>
        {icon}
      </div>
      <div className="text-[18px] font-bold text-evari-text">{title}</div>
      <div className="text-[12px] text-evari-dim mt-0.5 mb-3">{tagline}</div>
      <ul className="space-y-1.5">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-evari-text">
            <FileText className="h-3 w-3 text-evari-dimmer shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className={cn('mt-4 inline-flex items-center gap-1 text-[12px] font-semibold transition-colors', accent === 'gold' ? 'text-evari-gold' : 'text-evari-text group-hover:text-evari-gold')}>
        {cta} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
      </div>
    </button>
  );
}
