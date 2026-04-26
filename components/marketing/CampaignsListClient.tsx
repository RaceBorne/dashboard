'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Campaign, CampaignStatus } from '@/lib/marketing/types';
import type { CampaignStats } from '@/lib/marketing/campaigns';

interface Props {
  campaigns: Campaign[];
  statsMap: Record<string, CampaignStats>;
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft:     'bg-evari-surfaceSoft text-evari-dim',
  scheduled: 'bg-orange-500/15 text-orange-400',
  sending:   'bg-evari-gold/15 text-evari-gold',
  sent:      'bg-evari-success/15 text-evari-success',
  failed:    'bg-evari-danger/15 text-evari-danger',
};

export function CampaignsListClient({ campaigns, statsMap }: Props) {
  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-evari-dimmer tabular-nums">{campaigns.length} campaigns</span>
        <Link
          href="/email/campaigns/new"
          className="ml-auto inline-flex items-center gap-1 rounded-md h-8 px-2.5 text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-105 transition duration-500 ease-in-out"
        >
          <Plus className="h-3.5 w-3.5" />
          New campaign
        </Link>
      </div>

      <div className="rounded-md bg-evari-surface border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge/30">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Recipients</th>
              <th className="px-3 py-2 font-medium text-right">Sent / Open / Click</th>
              <th className="px-3 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-evari-dimmer text-sm">
                  No campaigns yet. Click <span className="text-evari-text font-semibold">New campaign</span> to start one.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => {
                const s = statsMap[c.id] ?? { total: 0, sent: 0, opened: 0, clicked: 0, delivered: 0, bounced: 0, failed: 0 };
                return (
                  <tr key={c.id} className="border-b border-evari-edge/20 last:border-0 hover:bg-evari-surfaceSoft/40 transition-colors">
                    <td className="px-3 py-2">
                      <Link
                        href={`/email/campaigns/${c.id}`}
                        className="text-evari-text font-medium hover:text-evari-gold transition-colors"
                      >
                        {c.name || 'Untitled'}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-evari-dim text-xs truncate max-w-[260px]">{c.subject || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium',
                          STATUS_BADGE[c.status],
                        )}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums text-xs">{s.total}</td>
                    <td className="px-3 py-2 text-right text-evari-dim font-mono tabular-nums text-xs">
                      {s.sent} · {s.opened} · {s.clicked}
                    </td>
                    <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">
                      {new Date(c.updatedAt).toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
