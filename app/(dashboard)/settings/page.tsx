import { TopBar } from '@/components/sidebar/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { getIntegrationStatuses } from '@/lib/mock/integrations';
import type { IntegrationStatus } from '@/lib/types';

const CATEGORY_LABEL: Record<IntegrationStatus['category'], string> = {
  ai: 'AI',
  commerce: 'Commerce',
  seo: 'SEO & analytics',
  leads: 'Leads',
  social: 'Social',
  storage: 'Storage',
};

export default function SettingsPage() {
  const statuses = getIntegrationStatuses();
  const grouped = statuses.reduce<Record<string, IntegrationStatus[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});
  const order: IntegrationStatus['category'][] = ['ai', 'commerce', 'seo', 'leads', 'social', 'storage'];
  const connected = statuses.filter((s) => s.connected).length;

  return (
    <>
      <TopBar
        title="Settings"
        subtitle={connected + ' of ' + statuses.length + ' integrations connected'}
      />

      <div className="p-6 max-w-[1200px] space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>How this dashboard reads credentials</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-evari-dim leading-relaxed space-y-2">
            <p>
              Every integration below is stubbed and returns mock data until the listed environment
              variables are set. Add them to <code className="font-mono text-evari-text">.env.local</code> for
              local development, then to the Vercel project for staging and production.
            </p>
            <p>
              The AI Gateway works automatically on Vercel via OIDC after running{' '}
              <code className="font-mono text-evari-text">vercel link</code> and{' '}
              <code className="font-mono text-evari-text">vercel env pull</code>. No manual key needed in
              production.
            </p>
          </CardContent>
        </Card>

        {order.map((cat) => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          return (
            <section key={cat} className="space-y-3">
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
                {CATEGORY_LABEL[cat]}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((s) => (
                  <IntegrationCard key={s.key} s={s} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function IntegrationCard({ s }: { s: IntegrationStatus }) {
  return (
    <div className="rounded-lg border border-evari-edge bg-evari-surface p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-evari-text">{s.label}</div>
          <a
            href={s.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 text-[11px] text-evari-dim hover:text-evari-gold inline-flex items-center gap-1"
          >
            documentation
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        {s.connected ? (
          <Badge variant="success" className="text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            connected
          </Badge>
        ) : (
          <Badge variant="warning" className="text-[10px]">
            <AlertCircle className="h-3 w-3" />
            not connected
          </Badge>
        )}
      </div>
      {s.notes && <p className="text-xs text-evari-dim leading-relaxed mb-3">{s.notes}</p>}
      {s.envVarsRequired.length > 0 && (
        <div className="rounded-md border border-evari-edge bg-evari-ink p-2.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1.5">
            Required env vars
          </div>
          <ul className="space-y-1">
            {s.envVarsRequired.map((v) => {
              const missing = s.envVarsMissing.includes(v);
              return (
                <li key={v} className="flex items-center justify-between text-[11px] font-mono">
                  <span className={missing ? 'text-evari-dimmer' : 'text-evari-text'}>{v}</span>
                  {missing ? (
                    <span className="text-amber-400">missing</span>
                  ) : (
                    <span className="text-emerald-400">set</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
