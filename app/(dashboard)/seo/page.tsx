import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wand2, ExternalLink, ArrowRight, AlertOctagon, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { cn, relativeTime } from '@/lib/utils';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listAuditFindings } from '@/lib/dashboard/repository';
import type { AuditSeverity } from '@/lib/types';

const SEVERITY: Record<AuditSeverity, {
  ring: string;
  dot: string;
  label: string;
  Icon: typeof AlertOctagon;
  bgSoft: string;
  textTone: string;
}> = {
  critical: { ring: 'ring-red-500/40',     dot: 'bg-red-400',     label: 'Critical', Icon: AlertOctagon,   bgSoft: 'bg-red-500/5',     textTone: 'text-red-400' },
  warning:  { ring: 'ring-evari-warn/40',  dot: 'bg-evari-warn',  label: 'Warning',  Icon: AlertTriangle,  bgSoft: 'bg-evari-warn/5',  textTone: 'text-evari-warn' },
  info:     { ring: 'ring-sky-500/30',     dot: 'bg-sky-400',     label: 'Info',     Icon: Info,           bgSoft: 'bg-sky-500/5',     textTone: 'text-sky-400' },
  pass:     { ring: 'ring-emerald-500/25', dot: 'bg-emerald-400', label: 'Pass',     Icon: CheckCircle2,   bgSoft: 'bg-emerald-500/5', textTone: 'text-emerald-400' },
};

export default async function SEOPage() {
  const findings = await listAuditFindings(createSupabaseAdmin());
  const sorted = [...findings].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2, pass: 3 };
    return order[a.severity] - order[b.severity];
  });

  const counts = findings.reduce<Record<AuditSeverity, number>>(
    (a, f) => ({ ...a, [f.severity]: (a[f.severity] || 0) + 1 }),
    { critical: 0, warning: 0, info: 0, pass: 0 },
  );

  return (
    <>
      <TopBar title="SEO Health" subtitle="evari.cc" />

      <div className="px-gutter py-5 space-y-6">
        {/* Migration banner — explain the live engine lives elsewhere */}
        <div className="rounded-panel bg-evari-warn/10 ring-1 ring-evari-warn/30 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 text-[13px] text-evari-text leading-relaxed">
            <span className="font-semibold">Audit snapshot from Supabase.</span>{' '}
            <span className="text-evari-dim">
              The live audit + auto-fix engine, scoped to your real Shopify
              catalog, runs at /shopify/seo-health.
            </span>
          </div>
          <Button asChild variant="primary" size="sm" className="shrink-0">
            <Link href="/shopify/seo-health">
              Open Shopify SEO Health
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {/* Severity summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryTile severity="critical" value={counts.critical} />
          <SummaryTile severity="warning"  value={counts.warning} />
          <SummaryTile severity="info"     value={counts.info} />
          <SummaryTile severity="pass"     value={counts.pass} />
        </div>

        {/* Findings list — generous spacing, two-column inside each card */}
        <div className="space-y-4">
          {sorted.map((f) => {
            const tone = SEVERITY[f.severity];
            const Icon = tone.Icon;
            return (
              <article
                key={f.id}
                className={cn(
                  'rounded-panel bg-evari-surface ring-1 ring-inset overflow-hidden',
                  tone.ring,
                )}
              >
                <header className={cn('px-6 py-4 border-b border-evari-edge/30 flex items-center gap-3', tone.bgSoft)}>
                  <Icon className={cn('h-4 w-4 shrink-0', tone.textTone)} />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <h3 className="text-[14px] font-semibold text-evari-text truncate">{f.title}</h3>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                      {f.category.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="muted" className="text-[9px]">
                      detected {relativeTime(f.detectedAt)}
                    </Badge>
                  </div>
                  {f.autoFixAvailable && (
                    <Button asChild size="sm" variant="primary" className="shrink-0">
                      <Link
                        href={`/shopify/seo-health?finding=${encodeURIComponent(f.id)}`}
                        title="Open this finding in the live SEO Health engine"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Apply auto-fix
                      </Link>
                    </Button>
                  )}
                </header>

                <div className="px-6 py-5 space-y-4">
                  <p className="text-[13px] text-evari-dim leading-relaxed">{f.description}</p>

                  {f.severity !== 'pass' && f.recommendation && (
                    <div className="rounded-md bg-evari-surfaceSoft px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-semibold mb-1.5">
                        Recommendation
                      </div>
                      <p className="text-[13px] text-evari-text leading-relaxed">{f.recommendation}</p>
                    </div>
                  )}

                  {f.affectedUrls.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-semibold">
                        Affected URLs
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {f.affectedUrls.slice(0, 8).map((u) => (
                          <a
                            key={u}
                            href={u.startsWith('http') ? u : 'https://evari.cc' + u}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono text-evari-dim hover:text-evari-gold inline-flex items-center gap-1 px-2 py-1 rounded-md bg-evari-surfaceSoft border border-evari-edge/30"
                          >
                            {u}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ))}
                        {f.affectedUrls.length > 8 ? (
                          <span className="text-[11px] text-evari-dimmer px-2 py-1">
                            +{f.affectedUrls.length - 8} more
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SummaryTile({ severity, value }: { severity: AuditSeverity; value: number }) {
  const tone = SEVERITY[severity];
  const Icon = tone.Icon;
  return (
    <div className="rounded-panel bg-evari-surface px-5 py-4 flex items-center gap-4">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center', tone.bgSoft)}>
        <Icon className={cn('h-4 w-4', tone.textTone)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-semibold">
          {tone.label}
        </div>
        <div className={cn('text-2xl font-medium tracking-tight font-mono tabular-nums', tone.textTone)}>
          {value}
        </div>
      </div>
    </div>
  );
}
