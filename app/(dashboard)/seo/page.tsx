import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wand2, ExternalLink, ArrowRight } from 'lucide-react';
import { cn, relativeTime } from '@/lib/utils';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listAuditFindings } from '@/lib/dashboard/repository';
import type { AuditSeverity } from '@/lib/types';

const SEVERITY_TONE: Record<AuditSeverity, { ring: string; dot: string; label: string }> = {
 critical: { ring: 'ring-red-500/40', dot: 'bg-red-400', label: 'Critical' },
 warning: { ring: 'ring-evari-warn/40', dot: 'bg-evari-warn', label: 'Warning' },
 info: { ring: 'ring-sky-500/40', dot: 'bg-sky-400', label: 'Info' },
 pass: { ring: 'ring-emerald-500/30', dot: 'bg-emerald-400', label: 'Pass' },
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

  <div className="p-6 space-y-5">
  <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-4 py-3 flex items-start sm:items-center gap-3 flex-col sm:flex-row">
   <div className="flex-1 text-sm text-evari-text leading-relaxed">
   <span className="font-medium">Audit snapshot from Supabase.</span>
   <span className="text-evari-dim">
    {' '}The live audit + auto-fix engine, scoped to your real Shopify
    catalog, is being built at /shopify/seo-health.
   </span>
   </div>
   <Button asChild variant="primary" size="sm" className="shrink-0">
   <Link href="/shopify/seo-health">
    Open Shopify SEO Health
    <ArrowRight className="h-3 w-3" />
   </Link>
   </Button>
  </div>

  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
   <SummaryTile label="Critical" value={counts.critical} tone="text-evari-danger" />
   <SummaryTile label="Warnings" value={counts.warning} tone="text-evari-warn" />
   <SummaryTile label="Info" value={counts.info} tone="text-sky-400" />
   <SummaryTile label="Passing" value={counts.pass} tone="text-evari-success" />
  </div>

  <ul className="space-y-1">
   {sorted.map((f) => {
   const tone = SEVERITY_TONE[f.severity];
   return (
    <li
    key={f.id}
    className={cn(
     'rounded-md bg-evari-surface/60 p-5 ring-1 ring-inset',
     tone.ring,
    )}
    >
    <div className="flex items-start gap-3">
     <span className={cn('h-2 w-2 mt-2 rounded-full shrink-0', tone.dot)} />
     <div className="flex-1 min-w-0">
     <div className="flex items-center gap-2 flex-wrap mb-1">
      <h3 className="text-sm font-medium text-evari-text">{f.title}</h3>
      <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
      {f.category.replace(/_/g, ' ')}
      </Badge>
      <Badge variant="muted" className="text-[9px]">
      detected {relativeTime(f.detectedAt)}
      </Badge>
     </div>
     <p className="text-sm text-evari-dim leading-relaxed">{f.description}</p>
     {f.severity !== 'pass' && f.recommendation && (
      <div className="mt-3 rounded-md bg-evari-surfaceSoft p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1">
       Recommendation
      </div>
      <p className="text-sm text-evari-text leading-relaxed">{f.recommendation}</p>
      </div>
     )}
     {f.affectedUrls.length > 0 && (
      <div className="mt-3 flex gap-1.5 flex-wrap">
      {f.affectedUrls.slice(0, 5).map((u) => (
       <a
       key={u}
       href={u.startsWith('http') ? u : 'https://evari.cc' + u}
       target="_blank"
       rel="noreferrer"
       className="text-[11px] font-mono text-evari-dim hover:text-evari-gold inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-evari-surfaceSoft"
       >
       {u}
       <ExternalLink className="h-2.5 w-2.5" />
       </a>
      ))}
      </div>
     )}
     </div>
     <div className="shrink-0 flex flex-col items-end gap-2">
     {f.autoFixAvailable && (
      <Button asChild size="sm" variant="primary">
      <Link
       href={`/shopify/seo-health?finding=${encodeURIComponent(f.id)}`}
       title="Open this finding in the live SEO Health engine"
      >
       <Wand2 className="h-3 w-3" />
       Apply auto-fix
      </Link>
      </Button>
     )}
     </div>
    </div>
    </li>
   );
   })}
  </ul>
  </div>
 </>
 );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
 return (
 <div className="rounded-lg bg-evari-surface p-4">
  <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1.5">
  {label}
  </div>
  <div className={cn('text-2xl font-medium tracking-tight font-mono tabular-nums', tone)}>
  {value}
  </div>
 </div>
 );
}
