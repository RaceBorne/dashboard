'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Mail, MailX, MousePointerClick, ShieldAlert, UserMinus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignAnalytics, RecipientActivity } from '@/lib/marketing/campaign-analytics';

interface Props {
  analytics: CampaignAnalytics;
}

type Tab = 'overview' | 'recipients' | 'links';

/**
 * Three-tab analytics block surfaced underneath the campaign editor
 * once a campaign has been sent. Pure render of the
 * CampaignAnalytics shape — no fetching here.
 */
export function CampaignAnalyticsTabs({ analytics }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 mt-3">
      <header className="flex items-center gap-1 border-b border-evari-edge/20 px-2">
        {(['overview', 'recipients', 'links'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-2 text-sm transition-colors duration-200 border-b-2',
              tab === t
                ? 'text-evari-text border-evari-gold'
                : 'text-evari-dim hover:text-evari-text border-transparent',
            )}
          >
            {t === 'overview' ? 'Overview' : t === 'recipients' ? 'Recipient activity' : 'Link activity'}
          </button>
        ))}
      </header>
      <div className="p-4">
        {tab === 'overview' ? <Overview a={analytics} /> : null}
        {tab === 'recipients' ? <Recipients a={analytics} /> : null}
        {tab === 'links' ? <Links a={analytics} /> : null}
      </div>
    </section>
  );
}

// ─── Overview ───────────────────────────────────────────────────

function pct(n: number) { return `${n.toFixed(2)}%`; }

function Overview({ a }: { a: CampaignAnalytics }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="Open rate"  value={pct(a.rates.openRate)}        sub={`${a.totals.opened} / ${a.totals.delivered}`} />
        <Metric label="Click rate" value={pct(a.rates.clickRate)}       sub={`${a.totals.clicked} / ${a.totals.delivered}`} />
        <Metric label="CTOR"       value={pct(a.rates.clickToOpenRate)} sub={`${a.totals.clicked} / ${a.totals.opened}`} />
        <Metric label="Bounce"     value={pct(a.rates.bounceRate)}      sub={`${a.totals.bounced} / ${a.totals.total}`} />
      </div>
      <EngagementChart a={a} />
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-evari-edge/30 bg-evari-ink p-3">
      <div className="text-2xl font-semibold tabular-nums text-evari-text">{value}</div>
      <div className="text-[11px] text-evari-text mt-0.5">{label}</div>
      <div className="text-[10px] text-evari-dimmer font-mono tabular-nums mt-0.5">{sub}</div>
    </div>
  );
}

function EngagementChart({ a }: { a: CampaignAnalytics }) {
  const max = useMemo(() => {
    let m = 0;
    for (const b of a.buckets) {
      m = Math.max(m, b.delivered, b.opened, b.clicked, b.bounced);
    }
    return m;
  }, [a.buckets]);

  if (a.buckets.length === 0) {
    return (
      <div className="rounded-md border border-evari-edge/30 bg-evari-ink p-6 text-center text-sm text-evari-dimmer">
        Engagement chart appears once events start arriving.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-evari-edge/30 bg-evari-ink p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-evari-text">Engagement over time</h4>
        <Legend />
      </div>
      <div className="flex items-end gap-1 h-40 overflow-x-auto pb-1">
        {a.buckets.map((b) => (
          <div key={b.at} className="flex flex-col items-center gap-0.5 shrink-0">
            <div className="flex items-end gap-0.5 h-32" title={`${new Date(b.at).toLocaleString()} — delivered ${b.delivered}, opened ${b.opened}, clicked ${b.clicked}, bounced ${b.bounced}`}>
              <Bar value={b.delivered} max={max} className="bg-blue-500/80" />
              <Bar value={b.opened}    max={max} className="bg-green-500/80" />
              <Bar value={b.clicked}   max={max} className="bg-evari-gold/80" />
              <Bar value={b.bounced}   max={max} className="bg-red-500/70" />
            </div>
            <span className="text-[8px] tabular-nums text-evari-dimmer">{shortTime(b.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const h = max > 0 ? Math.max(2, (value / max) * 128) : 2;
  return <div className={cn('w-1.5 rounded-sm transition-all', className)} style={{ height: `${h}px` }} />;
}

function Legend() {
  const items = [
    ['bg-blue-500/80', 'Delivered'],
    ['bg-green-500/80', 'Opened'],
    ['bg-evari-gold/80', 'Clicked'],
    ['bg-red-500/70', 'Bounced'],
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1 text-[10px] text-evari-dim">
          <span className={cn('h-2 w-2 rounded-sm', cls)} />
          {label}
        </span>
      ))}
    </div>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
}

// ─── Recipient activity ─────────────────────────────────────────

const FILTERS: Array<{ key: string; label: string; Icon: typeof Mail; predicate: (r: RecipientActivity) => boolean }> = [
  { key: 'delivered',    label: 'Delivered',    Icon: CheckCircle2,      predicate: (r) => Boolean(r.deliveredAt) },
  { key: 'opened',       label: 'Opened',       Icon: Mail,               predicate: (r) => Boolean(r.openedAt) },
  { key: 'clicked',      label: 'Clicked',      Icon: MousePointerClick,  predicate: (r) => Boolean(r.clickedAt) },
  { key: 'bounced',      label: 'Bounced',      Icon: MailX,              predicate: (r) => Boolean(r.bouncedAt) },
  { key: 'unsubscribed', label: 'Unsubscribed', Icon: UserMinus,          predicate: (r) => r.status === 'unsubscribed' },
  { key: 'spam',         label: 'Spam',         Icon: ShieldAlert,        predicate: (r) => r.status === 'spam_complaint' },
  { key: 'all',          label: 'All',          Icon: Users,              predicate: () => true },
];

function Recipients({ a }: { a: CampaignAnalytics }) {
  const [f, setF] = useState('delivered');
  const filterFn = FILTERS.find((x) => x.key === f)?.predicate ?? (() => true);
  const rows = a.recipients.filter(filterFn).sort((rA, rB) => (rB.sentAt ?? '').localeCompare(rA.sentAt ?? ''));
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-3">
      <ul className="space-y-0.5">
        {FILTERS.map((flt) => {
          const count = a.recipients.filter(flt.predicate).length;
          const Icon = flt.Icon;
          const active = f === flt.key;
          return (
            <li key={flt.key}>
              <button
                type="button"
                onClick={() => setF(flt.key)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors duration-150',
                  active ? 'bg-evari-ink/60 text-evari-text' : 'text-evari-dim hover:bg-evari-ink/30 hover:text-evari-text',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1 text-left truncate">{flt.label}</span>
                <span className="text-[10px] tabular-nums text-evari-dimmer">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="rounded-md border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-evari-ink text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">
            <tr>
              <th className="px-3 py-1.5 text-left">Email</th>
              <th className="px-3 py-1.5 text-left">Name</th>
              <th className="px-3 py-1.5 text-left">Sent</th>
              <th className="px-3 py-1.5 text-left">Opened</th>
              <th className="px-3 py-1.5 text-left">Clicked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-evari-edge/10">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-evari-dimmer text-sm">No recipients in this bucket.</td></tr>
            ) : rows.slice(0, 200).map((r) => (
              <tr key={r.id} className="hover:bg-evari-ink/30">
                <td className="px-3 py-1.5 font-mono text-[12px] text-evari-text truncate max-w-[260px]">{r.email ?? '—'}</td>
                <td className="px-3 py-1.5 text-evari-text truncate max-w-[160px]">{r.fullName ?? ''}</td>
                <td className="px-3 py-1.5 text-evari-dim font-mono tabular-nums text-[11px]">{r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}</td>
                <td className="px-3 py-1.5 text-evari-dim font-mono tabular-nums text-[11px]">{r.openedAt ? new Date(r.openedAt).toLocaleString() : '—'}</td>
                <td className="px-3 py-1.5 text-evari-dim font-mono tabular-nums text-[11px]">{r.clickedAt ? new Date(r.clickedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 200 ? (
          <div className="px-3 py-2 text-[10px] text-evari-dimmer border-t border-evari-edge/20">
            Showing first 200 of {rows.length}. CSV export coming next.
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Link activity ──────────────────────────────────────────────

function Links({ a }: { a: CampaignAnalytics }) {
  const totalDelivered = a.totals.delivered;
  const noClick = Math.max(0, totalDelivered - a.peopleClicked);
  const clicksPerPerson = a.peopleClicked > 0 ? (a.totalClicks / a.peopleClicked).toFixed(2) : '0.00';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="People clicked"   value={String(a.peopleClicked)} sub={`${pct(a.rates.clickRate)} click rate`} />
        <Metric label="Total clicks"     value={String(a.totalClicks)}   sub={`${a.peopleClicked} unique`} />
        <Metric label="Clicks per person" value={clicksPerPerson}        sub="Average among clickers" />
        <Metric label="Did not click"    value={String(noClick)}         sub={`${pct((noClick / Math.max(1, totalDelivered)) * 100)} of delivered`} />
      </div>
      <div className="rounded-md border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-evari-ink text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">
            <tr>
              <th className="px-3 py-1.5 text-left">URL</th>
              <th className="px-3 py-1.5 text-right">Unique clicks</th>
              <th className="px-3 py-1.5 text-right">Total clicks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-evari-edge/10">
            {a.links.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-evari-dimmer text-sm">No tracked links found in the campaign body.</td></tr>
            ) : a.links.map((link) => (
              <tr key={link.url} className="hover:bg-evari-ink/30">
                <td className="px-3 py-1.5">
                  <a href={link.url} target="_blank" rel="noopener" className="text-evari-gold hover:underline truncate inline-block max-w-[480px]">{link.url}</a>
                </td>
                <td className="px-3 py-1.5 text-right text-evari-text font-mono tabular-nums text-[11px]">{link.uniqueClicks.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-evari-dim font-mono tabular-nums text-[11px]">{link.totalClicks.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
