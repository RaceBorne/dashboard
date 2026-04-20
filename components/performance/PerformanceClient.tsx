'use client';

import { useMemo, useState } from 'react';
import { Gauge, RefreshCw, Smartphone, Monitor, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PerformanceOverview, PSISnapshot } from '@/lib/performance/repository';

type Strategy = 'mobile' | 'desktop';

export function PerformanceClient({ overview }: { overview: PerformanceOverview }) {
  const [strategy, setStrategy] = useState<Strategy>('mobile');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const latestForStrategy = useMemo(
    () => overview.latest.filter((s) => s.strategy === strategy),
    [overview.latest, strategy],
  );

  const targetLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of overview.targets) m.set(t.url, t.label ?? prettyUrl(t.url));
    return (url: string) => m.get(url) ?? prettyUrl(url);
  }, [overview.targets]);

  const historyByUrl = useMemo(() => {
    const m = new Map<string, PSISnapshot[]>();
    for (const s of overview.history) {
      if (s.strategy !== strategy) continue;
      const arr = m.get(s.url) ?? [];
      arr.push(s);
      m.set(s.url, arr);
    }
    // Sort each ascending by date for sparkline
    for (const arr of m.values()) {
      arr.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
    }
    return m;
  }, [overview.history, strategy]);

  const avgScore = latestForStrategy.length
    ? latestForStrategy.reduce((a, s) => a + s.performanceScore, 0) / latestForStrategy.length
    : 0;
  const avgLcp = latestForStrategy.length
    ? latestForStrategy.reduce((a, s) => a + s.lcpSec, 0) / latestForStrategy.length
    : 0;
  const avgCls = latestForStrategy.length
    ? latestForStrategy.reduce((a, s) => a + s.clsScore, 0) / latestForStrategy.length
    : 0;
  const avgInp = latestForStrategy.length
    ? latestForStrategy.reduce((a, s) => a + s.inpMs, 0) / latestForStrategy.length
    : 0;

  async function runNow() {
    setRunning(true);
    setRunError(null);
    setRunMsg(null);
    try {
      const res = await fetch(`/api/integrations/pagespeed/ingest?strategy=${strategy}`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        written?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setRunError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setRunMsg(
        `Ran ${json.written ?? 0} audits${json.failed ? ` · ${json.failed} failed` : ''}. Reload to see new scores.`,
      );
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 max-w-[1400px] space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex bg-evari-surface rounded-md p-0.5">
          <StrategyButton
            active={strategy === 'mobile'}
            onClick={() => setStrategy('mobile')}
            icon={<Smartphone className="h-3.5 w-3.5" />}
            label="Mobile"
          />
          <StrategyButton
            active={strategy === 'desktop'}
            onClick={() => setStrategy('desktop')}
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="Desktop"
          />
        </div>

        <div className="flex items-center gap-3">
          {runMsg && <span className="text-xs text-evari-success">{runMsg}</span>}
          {runError && <span className="text-xs text-evari-danger">{runError}</span>}
          <Button
            size="sm"
            variant="primary"
            onClick={runNow}
            disabled={running || !overview.connected}
            title={
              overview.connected
                ? 'Re-run PSI for every target URL'
                : 'PSI not connected — set PAGESPEED_API_KEY'
            }
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', running && 'animate-spin')} />
            {running ? 'Running…' : 'Run now'}
          </Button>
        </div>
      </div>

      {!overview.hasData ? (
        <EmptyState connected={overview.connected} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreTile
              label="Avg performance"
              value={`${Math.round(avgScore * 100)}`}
              suffix=" / 100"
              tone={scoreTone(avgScore)}
              hero
            />
            <MetricTile
              label="LCP (avg)"
              value={avgLcp.toFixed(2)}
              suffix=" s"
              tone={lcpTone(avgLcp)}
            />
            <MetricTile
              label="CLS (avg)"
              value={avgCls.toFixed(3)}
              tone={clsTone(avgCls)}
            />
            <MetricTile
              label="INP (avg)"
              value={Math.round(avgInp).toString()}
              suffix=" ms"
              tone={inpTone(avgInp)}
            />
          </div>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle>Per-URL ({strategy})</CardTitle>
              <Badge variant="muted">{latestForStrategy.length} URLs</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
                    <th className="text-left px-5 py-2 font-medium">URL</th>
                    <th className="text-right px-5 py-2 font-medium">Score</th>
                    <th className="text-right px-5 py-2 font-medium">LCP</th>
                    <th className="text-right px-5 py-2 font-medium">CLS</th>
                    <th className="text-right px-5 py-2 font-medium">INP</th>
                    <th className="text-right px-5 py-2 font-medium">FCP</th>
                    <th className="text-right px-5 py-2 font-medium">TTFB</th>
                    <th className="px-5 py-2 font-medium w-32">14d trend</th>
                  </tr>
                </thead>
                <tbody>
                  {latestForStrategy
                    .slice()
                    .sort((a, b) => b.performanceScore - a.performanceScore)
                    .map((snap) => (
                      <UrlRow
                        key={`${snap.url}-${snap.strategy}`}
                        snap={snap}
                        label={targetLabel(snap.url)}
                        history={historyByUrl.get(snap.url) ?? []}
                      />
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StrategyButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-evari-surfaceSoft text-evari-text'
          : 'text-evari-dim hover:text-evari-text',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <Gauge className="h-10 w-10 mx-auto mb-4 text-evari-dimmer" />
        <div className="text-sm text-evari-text font-medium mb-1">
          {connected ? 'No PSI snapshots yet' : 'PageSpeed Insights not connected'}
        </div>
        <div className="text-xs text-evari-dim max-w-md mx-auto">
          {connected
            ? 'Click "Run now" to fetch the first scores for every target URL. The cron will then refresh them nightly at 06:00 UTC.'
            : 'Set PAGESPEED_API_KEY in .env.local (or the Vercel dashboard) and reload.'}
        </div>
      </CardContent>
    </Card>
  );
}

function UrlRow({
  snap,
  label,
  history,
}: {
  snap: PSISnapshot;
  label: string;
  history: PSISnapshot[];
}) {
  return (
    <tr className="last:border-0">
      <td className="px-5 py-2.5 text-evari-text">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          <a
            href={snap.url}
            target="_blank"
            rel="noreferrer"
            className="text-evari-dimmer hover:text-evari-text"
            title={snap.url}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="text-[11px] text-evari-dimmer font-mono truncate max-w-[380px]">
          {snap.url}
        </div>
      </td>
      <td className="text-right px-5 py-2.5">
        <ScorePill score={snap.performanceScore} />
      </td>
      <td className={cn('text-right px-5 py-2.5 font-mono tabular-nums', lcpText(snap.lcpSec))}>
        {snap.lcpSec.toFixed(2)}s
      </td>
      <td className={cn('text-right px-5 py-2.5 font-mono tabular-nums', clsText(snap.clsScore))}>
        {snap.clsScore.toFixed(3)}
      </td>
      <td className={cn('text-right px-5 py-2.5 font-mono tabular-nums', inpText(snap.inpMs))}>
        {Math.round(snap.inpMs)}ms
      </td>
      <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-dim">
        {snap.fcpSec.toFixed(2)}s
      </td>
      <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-dim">
        {snap.ttfbSec.toFixed(2)}s
      </td>
      <td className="px-5 py-2.5">
        <Sparkline
          values={history.map((h) => h.performanceScore)}
          min={0}
          max={1}
          className="h-7 w-28"
        />
      </td>
    </tr>
  );
}

function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone = scoreTone(score);
  const toneClasses =
    tone === 'good'
      ? 'bg-evari-success/15 text-evari-success'
      : tone === 'warn'
        ? 'bg-evari-gold/15 text-evari-gold'
        : 'bg-evari-danger/15 text-evari-danger';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[44px] rounded font-mono tabular-nums text-xs font-medium px-2 py-0.5',
        toneClasses,
      )}
    >
      {pct}
    </span>
  );
}

function ScoreTile({
  label,
  value,
  suffix,
  tone,
  hero,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone: 'good' | 'warn' | 'bad';
  hero?: boolean;
}) {
  const toneText =
    tone === 'good'
      ? 'text-evari-success'
      : tone === 'warn'
        ? 'text-evari-gold'
        : 'text-evari-danger';
  return (
    <div className="rounded-lg bg-evari-surface p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1.5">
        {label}
      </div>
      <div
        className={cn(
          'font-medium tracking-tight font-mono tabular-nums',
          hero ? 'text-3xl' : 'text-2xl',
          toneText,
        )}
      >
        {value}
        {suffix && <span className="text-evari-dim text-sm ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone: 'good' | 'warn' | 'bad';
}) {
  return <ScoreTile label={label} value={value} suffix={suffix} tone={tone} />;
}

function Sparkline({
  values,
  min,
  max,
  className,
}: {
  values: number[];
  min: number;
  max: number;
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <div className={cn('flex items-center text-evari-dimmer text-[10px]', className)}>
        {values.length === 1 ? '1 point' : '—'}
      </div>
    );
  }
  const range = max - min || 1;
  const width = 100;
  const height = 24;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = values[values.length - 1] ?? 0;
  const first = values[0] ?? 0;
  const color =
    last > first + 0.05
      ? 'stroke-evari-success'
      : last < first - 0.05
        ? 'stroke-evari-danger'
        : 'stroke-evari-dim';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={color}
      />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Thresholds — Google's "Good / Needs Improvement / Poor" cutoffs.
// -----------------------------------------------------------------------------

function scoreTone(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 0.9) return 'good';
  if (score >= 0.5) return 'warn';
  return 'bad';
}

function lcpTone(sec: number): 'good' | 'warn' | 'bad' {
  if (sec <= 2.5) return 'good';
  if (sec <= 4.0) return 'warn';
  return 'bad';
}

function lcpText(sec: number): string {
  const t = lcpTone(sec);
  return t === 'good' ? 'text-evari-text' : t === 'warn' ? 'text-evari-gold' : 'text-evari-danger';
}

function clsTone(cls: number): 'good' | 'warn' | 'bad' {
  if (cls <= 0.1) return 'good';
  if (cls <= 0.25) return 'warn';
  return 'bad';
}

function clsText(cls: number): string {
  const t = clsTone(cls);
  return t === 'good' ? 'text-evari-text' : t === 'warn' ? 'text-evari-gold' : 'text-evari-danger';
}

function inpTone(ms: number): 'good' | 'warn' | 'bad' {
  if (ms <= 200) return 'good';
  if (ms <= 500) return 'warn';
  return 'bad';
}

function inpText(ms: number): string {
  const t = inpTone(ms);
  return t === 'good' ? 'text-evari-text' : t === 'warn' ? 'text-evari-gold' : 'text-evari-danger';
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}
