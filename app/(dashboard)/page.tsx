import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/sidebar/TopBar';
import { EditorialHeadline } from '@/components/briefing/EditorialHeadline';
import { HeyEvariButton } from '@/components/assistant/HeyEvariButton';
import { BriefingCard } from '@/components/briefing/BriefingCard';
import { AnomalyList } from '@/components/briefing/AnomalyList';
import { MiniTrafficChart } from '@/components/briefing/MiniTrafficChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { buildBriefingPayload } from '@/lib/dashboard/briefing';
import { listLeads, listTrafficDays } from '@/lib/dashboard/repository';
import { relativeTime, formatGBP } from '@/lib/utils';

export default async function BriefingPage() {
  const supabase = createSupabaseAdmin();
  const [briefing, traffic, leads] = await Promise.all([
    buildBriefingPayload(supabase),
    listTrafficDays(supabase),
    listLeads(supabase),
  ]);

  const hotLeads = [...leads]
    .filter((l) =>
      ['configuring', 'discovery', 'quoted', 'contacted', 'new'].includes(l.stage),
    )
    .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
    .slice(0, 5);

  return (
    <>
      <TopBar title="Morning briefing" subtitle="today" />

      <div className="p-6 space-y-6">
        {/* Editorial headline + Hey Evari button on the same row */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <EditorialHeadline briefing={briefing} />
          </div>
          <HeyEvariButton />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Briefing — 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            <BriefingCard />

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Sessions, last 30 days</CardTitle>
                    <CardDescription>
                      From GA4 when connected; otherwise dashboard snapshot in Supabase
                    </CardDescription>
                  </div>
                  <Badge variant="muted">snapshot</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <MiniTrafficChart data={traffic} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Hot pipeline</CardTitle>
                  <CardDescription>Top 5 by estimated value</CardDescription>
                </div>
                <Link
                  href="/leads"
                  className="text-xs text-evari-dim hover:text-evari-text inline-flex items-center gap-1"
                >
                  All leads <ChevronRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {hotLeads.map((l) => (
                    <li key={l.id} className="bg-evari-surface/70 rounded-md">
                      <Link
                        href={`/leads/${l.id}`}
                        className="flex items-center gap-4 px-3 py-2.5 hover:bg-evari-surface rounded-md transition-colors"
                      >
                        <div className="h-8 w-8 rounded-full bg-evari-edge flex items-center justify-center text-xs text-evari-dim font-medium uppercase shrink-0">
                          {l.fullName
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-evari-text truncate">
                            {l.fullName}
                          </div>
                          <div className="text-xs text-evari-dim truncate">
                            {l.productInterest ?? 'no product specified'}
                            {l.location ? ` · ${l.location}` : ''}
                          </div>
                        </div>
                        <div className="hidden md:block text-right text-xs">
                          <div className="font-mono tabular-nums text-evari-text">
                            {l.estimatedValue ? formatGBP(l.estimatedValue) : '—'}
                          </div>
                          <div className="text-evari-dimmer">{relativeTime(l.lastTouchAt)}</div>
                        </div>
                        <Badge variant="muted" className="text-[10px] capitalize">
                          {l.stage}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Anomalies — 1/3 */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium tracking-tight text-evari-text">
                  What's worth your attention
                </h2>
                <Badge variant="critical" className="text-[10px]">
                  {briefing.anomalies.filter((a) => a.severity === 'critical').length} critical
                </Badge>
              </div>
              <AnomalyList anomalies={briefing.anomalies} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
