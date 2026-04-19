'use client';

import * as React from 'react';
import type { SalesPoint } from '@/lib/integrations/shopify';
import { cn, formatNumber, formatGBP } from '@/lib/utils';

/**
 * Sales-by-day chart.
 *
 * Self-contained inline-SVG bar chart so we don't drag in a charting
 * library for one view. Hovers show the daily sales + order count;
 * the totals strip above gives the at-a-glance picture.
 */
export function AnalyticsClient({
  initial,
  mock,
  fetchError,
}: {
  initial: SalesPoint[];
  mock: boolean;
  /** Set when Shopify is connected but `listSalesByDay` failed. */
  fetchError?: string | null;
}) {
  const [hover, setHover] = React.useState<SalesPoint | null>(null);

  const totalSales = initial.reduce((s, p) => s + p.sales, 0);
  const totalOrders = initial.reduce((s, p) => s + p.orders, 0);
  const aov = totalOrders > 0 ? totalSales / totalOrders : 0;
  const max = Math.max(1, ...initial.map((p) => p.sales));

  const lastWeek = initial.slice(-7).reduce((s, p) => s + p.sales, 0);
  const prevWeek = initial.slice(-14, -7).reduce((s, p) => s + p.sales, 0);
  const wow = prevWeek > 0 ? (lastWeek - prevWeek) / prevWeek : 0;

  return (
    <>
      {mock && (
        <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-4 py-2.5 text-xs text-evari-text mb-4">
          Connect Shopify in environment variables to load live order-based sales. Until then, charts show zeros.
        </div>
      )}
      {fetchError && (
        <div className="rounded-md bg-evari-danger/15 ring-1 ring-evari-danger/30 px-4 py-2.5 text-xs text-evari-text mb-4">
          Could not load sales: <span className="font-mono">{fetchError}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label={`${initial.length}d sales`} value={formatGBP(totalSales)} />
        <Stat label={`${initial.length}d orders`} value={formatNumber(totalOrders)} />
        <Stat label="Average order" value={formatGBP(aov)} />
        <Stat
          label="Week-on-week"
          value={`${wow >= 0 ? '+' : ''}${(wow * 100).toFixed(1)}%`}
          tone={wow >= 0 ? 'good' : 'bad'}
        />
      </div>

      <div className="rounded-xl bg-evari-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-evari-text">Sales by day</h2>
            <div className="text-[10px] text-evari-dimmer font-mono uppercase tracking-[0.08em] mt-0.5">
              {initial[0]?.date} → {initial[initial.length - 1]?.date}
            </div>
          </div>
          {hover && (
            <div className="text-xs text-evari-dim font-mono tabular-nums">
              {hover.date} · {formatGBP(hover.sales)} · {hover.orders} orders
            </div>
          )}
        </div>

        <div
          className="relative h-48"
          onMouseLeave={() => setHover(null)}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${initial.length * 12} 100`}
            preserveAspectRatio="none"
            className="overflow-visible"
          >
            {initial.map((p, i) => {
              const h = (p.sales / max) * 100;
              const x = i * 12;
              const isHover = hover?.date === p.date;
              return (
                <g key={p.date}>
                  <rect
                    x={x}
                    y={100 - h}
                    width={10}
                    height={h}
                    className={cn(
                      'transition-colors',
                      isHover ? 'fill-evari-gold' : 'fill-evari-gold/55 hover:fill-evari-gold/80',
                    )}
                    onMouseEnter={() => setHover(p)}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex justify-between text-[10px] text-evari-dimmer font-mono mt-2">
          <span>{initial[0]?.date.slice(5) ?? ''}</span>
          <span>{initial[Math.floor(initial.length / 2)]?.date.slice(5) ?? ''}</span>
          <span>{initial[initial.length - 1]?.date.slice(5) ?? ''}</span>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-evari-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-evari-surfaceSoft text-evari-dim">
            <tr>
              <th className="text-left text-[10px] uppercase tracking-[0.08em] font-medium px-3 py-2">Date</th>
              <th className="text-right text-[10px] uppercase tracking-[0.08em] font-medium px-3 py-2">Sales</th>
              <th className="text-right text-[10px] uppercase tracking-[0.08em] font-medium px-3 py-2">Orders</th>
              <th className="text-right text-[10px] uppercase tracking-[0.08em] font-medium px-3 py-2">AOV</th>
            </tr>
          </thead>
          <tbody>
            {[...initial].reverse().map((p) => (
              <tr key={p.date} className="border-t border-evari-edge/30">
                <td className="px-3 py-2 font-mono text-evari-text">{p.date}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-evari-text">
                  {formatGBP(p.sales)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{p.orders}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-evari-dim">
                  {p.orders > 0 ? formatGBP(p.sales / p.orders) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-xl bg-evari-surface p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-1">
        {label}
      </div>
      <div
        className={cn(
          'text-xl font-medium tabular-nums',
          tone === 'good' && 'text-evari-success',
          tone === 'bad' && 'text-evari-danger',
          !tone && 'text-evari-text',
        )}
      >
        {value}
      </div>
    </div>
  );
}
