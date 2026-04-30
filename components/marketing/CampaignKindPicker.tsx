'use client';

/**
 * Always-visible Newsletter / Direct message picker.
 *
 * Sits above the campaigns list as a permanent starting point. Same
 * two paths as the chooser on /email/campaigns/new, but each card is
 * a Link to /email/campaigns/new?kind=<x> so the new-campaign page
 * skips its chooser screen and goes straight into the right compose
 * surface.
 */

import Link from 'next/link';
import { ArrowRight, FileText, Mail, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CampaignKindPicker() {
  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-5 mb-3">
      <header className="text-center mb-4">
        <h2 className="text-[18px] font-bold text-evari-text">What are you sending?</h2>
        <p className="text-[12px] text-evari-dim mt-1 leading-relaxed max-w-2xl mx-auto">
          Pick the right starting point. Both end up in the inbox the same way; the compose surface and the analytics expectations differ.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <KindCard
          href="/email/campaigns/new?kind=newsletter"
          icon={<Sparkles className="h-5 w-5" />}
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
          href="/email/campaigns/new?kind=direct"
          icon={<Mail className="h-5 w-5" />}
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

      <p className="text-[10px] text-evari-dimmer text-center mt-3">
        Tip: you can also send a direct message to one person directly from a Lead detail without coming here.
      </p>
    </section>
  );
}

function KindCard({
  href, icon, title, tagline, features, cta, accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  features: string[];
  cta: string;
  accent: 'gold' | 'ink';
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group rounded-md border p-4 text-left transition-all hover:scale-[1.005] block',
        accent === 'gold'
          ? 'border-evari-gold/40 bg-evari-gold/5 hover:border-evari-gold hover:bg-evari-gold/10'
          : 'border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40',
      )}
    >
      <div className={cn(
        'inline-flex items-center justify-center h-9 w-9 rounded-lg mb-2',
        accent === 'gold' ? 'bg-evari-gold/20 text-evari-gold' : 'bg-evari-ink/60 text-evari-dim',
      )}>
        {icon}
      </div>
      <div className="text-[15px] font-bold text-evari-text">{title}</div>
      <div className="text-[11px] text-evari-dim mt-0.5 mb-2">{tagline}</div>
      <ul className="space-y-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-evari-text">
            <FileText className="h-2.5 w-2.5 text-evari-dimmer shrink-0 mt-1" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className={cn(
        'mt-3 inline-flex items-center gap-1 text-[11px] font-semibold transition-colors',
        accent === 'gold' ? 'text-evari-gold' : 'text-evari-text group-hover:text-evari-gold',
      )}>
        {cta} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
