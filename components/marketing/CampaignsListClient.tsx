'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar as CalendarIcon, Mail as MailIcon, Plus, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Campaign, CampaignStatus } from '@/lib/marketing/types';
import type { CampaignStats } from '@/lib/marketing/campaigns';

interface Props {
  campaigns: Campaign[];
  statsMap: Record<string, CampaignStats>;
  groupsMap: Record<string, string>;
  segmentsMap: Record<string, string>;
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft:     'bg-evari-surfaceSoft text-evari-dim border border-evari-edge/40',
  scheduled: 'bg-orange-500/10 text-orange-400 border border-orange-500/30',
  sending:   'bg-evari-gold/15 text-evari-gold border border-evari-gold/40',
  sent:      'bg-evari-success/15 text-evari-success border border-evari-success/40',
  failed:    'bg-evari-danger/15 text-evari-danger border border-evari-danger/40',
};

type RangeKey = '7d' | '30d' | '90d' | 'all';
const RANGE_LABEL: Record<RangeKey, string> = {
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  'all': 'All time',
};
const RANGE_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '7d':  7  * 86400 * 1000,
  '30d': 30 * 86400 * 1000,
  '90d': 90 * 86400 * 1000,
};

type StatusFilter = 'all' | CampaignStatus;
const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'scheduled', 'sending', 'sent', 'failed'];

function pct(n: number, d: number): string {
  if (d === 0) return '—';
  return `${((n / d) * 100).toFixed(2)}%`;
}

/**
 * Klaviyo-style campaign list. Filter bar across the top (date range +
 * status + search), table below with audience / send date / open rate /
 * click rate columns. Open + click rates are computed from the
 * delivered base — same denominator the campaign-detail Overview tab uses.
 */
export function CampaignsListClient({ campaigns, statsMap, groupsMap, segmentsMap }: Props) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = range === 'all' ? 0 : Date.now() - RANGE_MS[range];
    return campaigns.filter((c) => {
      const t = new Date(c.sentAt ?? c.updatedAt).getTime();
      if (cutoff && t < cutoff) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (!q) return true;
      return (c.name ?? '').toLowerCase().includes(q) || (c.subject ?? '').toLowerCase().includes(q);
    });
  }, [campaigns, range, status, search]);

  function audienceFor(c: Campaign): string {
    if (c.segmentId) return segmentsMap[c.segmentId] ?? 'Segment';
    if (c.groupId)   return groupsMap[c.groupId] ?? 'List';
    if (c.recipientEmails && c.recipientEmails.length > 0) return `Custom (${c.recipientEmails.length})`;
    return '—';
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="rounded-md bg-evari-surface border border-evari-edge/30">
        {/* Toolbar */}
        <header className="flex items-center gap-2 p-3 border-b border-evari-edge/20 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-2 rounded-md bg-evari-ink border border-evari-edge/30 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-evari-dimmer shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              className="flex-1 bg-transparent text-sm text-evari-text placeholder:text-evari-dimmer focus:outline-none"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} className="text-evari-dim hover:text-evari-text">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <div className="inline-flex items-center gap-1 rounded-md bg-evari-ink border border-evari-edge/30 px-2 py-1">
            <CalendarIcon className="h-3.5 w-3.5 text-evari-dimmer" />
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="bg-transparent text-xs text-evari-text focus:outline-none cursor-pointer"
            >
              {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                <option key={k} value={k}>{RANGE_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors duration-300',
                  status === s ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <span className="text-[10px] text-evari-dimmer tabular-nums ml-1">{visible.length} / {campaigns.length}</span>

          <Link
            href="/email/campaigns/new"
            className="ml-auto inline-flex items-center gap-1 rounded-md h-8 px-2.5 text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-105 transition"
          >
            <Plus className="h-3.5 w-3.5" /> New campaign
          </Link>
        </header>

        {/* Table */}
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-evari-dimmer">
            {campaigns.length === 0
              ? 'No campaigns yet — click "New campaign" to start one.'
              : 'Nothing matches that filter.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-evari-ink/40 text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">
              <tr>
                <th className="px-3 py-2 text-left">Campaign</th>
                <th className="px-3 py-2 text-left w-32">Audience</th>
                <th className="px-3 py-2 text-left w-24">Status</th>
                <th className="px-3 py-2 text-left w-40">Send date</th>
                <th className="px-3 py-2 text-right w-32">Open rate</th>
                <th className="px-3 py-2 text-right w-32">Click rate</th>
                <th className="px-3 py-2 text-right w-24">Recipients</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-evari-edge/10">
              {visible.map((c) => {
                const s = statsMap[c.id] ?? { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
                const sent = c.sentAt ? new Date(c.sentAt) : null;
                return (
                  <tr key={c.id} className="hover:bg-evari-ink/30 transition-colors">
                    <td className="px-3 py-2">
                      <Link href={`/email/campaigns/${c.id}`} className="block group">
                        <div className="flex items-center gap-2">
                          <MailIcon className="h-3 w-3 text-evari-dimmer shrink-0" />
                          <span className="text-evari-text font-medium group-hover:text-evari-gold transition-colors truncate max-w-[360px]">
                            {c.name || 'Untitled'}
                          </span>
                        </div>
                        {c.subject ? (
                          <div className="text-[11px] text-evari-dim truncate max-w-[420px] mt-0.5 ml-5">{c.subject}</div>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-evari-dim text-xs truncate">{audienceFor(c)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium', STATUS_BADGE[c.status])}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">
                      {sent ? sent.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="text-evari-text font-mono tabular-nums">{pct(s.opened, s.delivered)}</div>
                      <div className="text-[10px] text-evari-dimmer font-mono tabular-nums">{s.opened} of {s.delivered}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="text-evari-text font-mono tabular-nums">{pct(s.clicked, s.delivered)}</div>
                      <div className="text-[10px] text-evari-dimmer font-mono tabular-nums">{s.clicked} of {s.delivered}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums">{s.total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
