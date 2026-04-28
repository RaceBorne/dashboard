'use client';

/**
 * Read-only report view for a sent (or sending) campaign. Replaces
 * the editor entirely on /email/campaigns/[id] when the campaign
 * status is no longer mutable — drafts still get the editor.
 *
 * Shows the campaign metadata as static display values (no fake
 * inputs), the headline stats, and the analytics tabs. The only
 * action available is Duplicate -> creates a draft clone the
 * operator can re-send.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Copy,
  Loader2,
  Mail,
  Users,
  Calendar,
  Send,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Campaign } from '@/lib/marketing/types';
import type { CampaignAnalytics } from '@/lib/marketing/campaign-analytics';
import { CampaignAnalyticsTabs } from './CampaignAnalyticsTabs';
import { HoldingPenPanel } from './HoldingPenPanel';
import { VariantBreakdown } from './VariantBreakdown';

interface Props {
  campaign: Campaign;
  analytics: CampaignAnalytics | null;
  audienceLabel: string;
  recipientCount: number;
}

export function CampaignReport({ campaign, analytics, audienceLabel, recipientCount }: Props) {
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);

  async function duplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}/duplicate`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (data?.ok) router.push(`/email/campaigns/${data.campaign.id}`);
    } finally {
      setDuplicating(false);
    }
  }

  const isSending = campaign.status === 'sending';
  const isFailed  = campaign.status === 'failed';
  const sentDate  = campaign.sentAt ? new Date(campaign.sentAt) : null;

  // Computed headline rates from the analytics shape (server already
  // computed them — we just pull them out here).
  const opens     = analytics?.totals?.opened   ?? 0;
  const clicks    = analytics?.totals?.clicked  ?? 0;
  const delivered = analytics?.totals?.delivered ?? 0;
  const bounced   = analytics?.totals?.bounced  ?? 0;
  const openRate  = delivered > 0 ? (opens / delivered) * 100 : 0;
  const clickRate = delivered > 0 ? (clicks / delivered) * 100 : 0;
  const ctor      = opens > 0 ? (clicks / opens) * 100 : 0;
  const bounceRate = recipientCount > 0 ? (bounced / recipientCount) * 100 : 0;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="px-gutter py-4">
        <Link href="/email/campaigns" className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text transition-colors mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> All campaigns
        </Link>

        {/* Hero */}
        <header className="rounded-panel bg-evari-surface border border-evari-edge/30 p-5 mb-3">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusPill status={campaign.status} />
                <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
                  {campaign.kind === 'direct' ? 'Direct message' : 'Newsletter'}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-evari-text">{campaign.name || 'Untitled'}</h1>
              <p className="text-[13px] text-evari-dim mt-1">{campaign.subject || <em className="text-evari-dimmer">No subject</em>}</p>

              {/* Three quick metadata chips */}
              <div className="flex items-center flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-evari-dim">
                  <Users className="h-3.5 w-3.5 text-evari-dimmer" />
                  <strong className="text-evari-text">{recipientCount}</strong> recipient{recipientCount === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1.5 text-evari-dim">
                  <Mail className="h-3.5 w-3.5 text-evari-dimmer" />
                  {audienceLabel}
                </span>
                {sentDate ? (
                  <span className="inline-flex items-center gap-1.5 text-evari-dim">
                    <Calendar className="h-3.5 w-3.5 text-evari-dimmer" />
                    Sent {sentDate.toLocaleString()}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={duplicate}
                disabled={duplicating}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
              >
                {duplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                Duplicate to send again
              </button>
            </div>
          </div>
        </header>

        {/* Headline stats — four big numbers */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <BigStat
            label="Open rate"
            value={`${openRate.toFixed(2)}%`}
            sub={`${opens} of ${delivered}`}
            accent="gold"
            icon={<Mail className="h-4 w-4" />}
          />
          <BigStat
            label="Click rate"
            value={`${clickRate.toFixed(2)}%`}
            sub={`${clicks} of ${delivered}`}
            accent="gold"
            icon={<Send className="h-4 w-4" />}
          />
          <BigStat
            label="CTOR"
            value={`${ctor.toFixed(2)}%`}
            sub={`${clicks} of ${opens}`}
            accent="mute"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <BigStat
            label="Bounce rate"
            value={`${bounceRate.toFixed(2)}%`}
            sub={`${bounced} of ${recipientCount}`}
            accent={bounceRate > 5 ? 'danger' : 'mute'}
            icon={<AlertCircle className="h-4 w-4" />}
          />
        </div>

        {/* A/B subject test, when present */}
        {analytics?.variants && analytics.variants.length >= 2 ? <VariantBreakdown variants={analytics.variants} /> : null}

        {/* Holding pen — recipients held back during pre-flight review */}
        <HoldingPenPanel campaignId={campaign.id} />

        {/* Analytics detail tabs (Overview chart, Recipient activity, Link activity) */}
        {analytics ? (
          <CampaignAnalyticsTabs analytics={analytics} />
        ) : (
          <div className="rounded-panel bg-evari-surface border border-evari-edge/30 px-6 py-12 text-center text-sm text-evari-dim">
            {isSending ? 'Send is in flight — analytics will appear here once delivery webhooks arrive.' :
             isFailed  ? 'This send failed. No analytics to show.' :
                         'No analytics yet — this campaign hasn\'t been sent.'}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Campaign['status'] }) {
  const styles: Record<Campaign['status'], string> = {
    draft:     'bg-evari-edge/30 text-evari-dim',
    scheduled: 'bg-orange-500/15 text-orange-400',
    sending:   'bg-evari-gold/15 text-evari-gold',
    sent:      'bg-evari-success/15 text-evari-success',
    failed:    'bg-evari-danger/15 text-evari-danger',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold', styles[status])}>
      {status}
    </span>
  );
}

function BigStat({ label, value, sub, accent, icon }: { label: string; value: string; sub: string; accent: 'gold' | 'mute' | 'danger'; icon: React.ReactNode }) {
  const accentCls = accent === 'gold' ? 'text-evari-gold' : accent === 'danger' ? 'text-evari-danger' : 'text-evari-text';
  return (
    <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md', accent === 'gold' ? 'bg-evari-gold/15' : accent === 'danger' ? 'bg-evari-danger/15' : 'bg-evari-ink/40', accentCls)}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer font-medium">{label}</span>
      </div>
      <div className={cn('text-3xl font-bold tabular-nums', accentCls)}>{value}</div>
      <div className="text-[11px] text-evari-dim font-mono tabular-nums mt-1">{sub}</div>
    </div>
  );
}
