import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MapPin, Phone, Tag, MessageSquare } from 'lucide-react';
import { TopBar } from '@/components/sidebar/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StageBadge } from '@/components/leads/StageBadge';
import { SourceBadge } from '@/components/leads/SourceBadge';
import { ActivityTimeline } from '@/components/leads/ActivityTimeline';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead } from '@/lib/dashboard/repository';
import { formatGBP, relativeTime } from '@/lib/utils';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const lead = await getLead(createSupabaseAdmin(), id);
  if (!lead) notFound();

  const initials = lead.fullName.split(' ').map((p) => p[0]).join('').slice(0, 2);

  return (
    <>
      <TopBar title={lead.fullName} subtitle={lead.stage} />

      <div className="p-6 max-w-[1400px] space-y-5">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text"
        >
          <ArrowLeft className="h-3 w-3" />
          All leads
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-full bg-evari-edge flex items-center justify-center text-base text-evari-dim font-medium uppercase shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-xl font-medium tracking-tight text-evari-text">
                        {lead.fullName}
                      </h2>
                      <StageBadge stage={lead.stage} />
                      <SourceBadge source={lead.source} />
                    </div>
                    <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-evari-dim">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {lead.email}
                      </span>
                      {lead.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {lead.phone}
                        </span>
                      )}
                      {lead.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {lead.location}
                        </span>
                      )}
                    </div>
                    {lead.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {lead.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            <Tag className="h-2.5 w-2.5" />
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {lead.threadId && (
                      <Link href={'/conversations?thread=' + lead.threadId}>
                        <Button variant="outline" size="sm">
                          <MessageSquare className="h-3 w-3" />
                          Open conversation
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Estimated value" value={lead.estimatedValue ? formatGBP(lead.estimatedValue) : '—'} />
                  <Stat label="Intent" value={lead.intent} />
                  <Stat label="First seen" value={relativeTime(lead.firstSeenAt)} />
                  <Stat label="Last touch" value={relativeTime(lead.lastTouchAt)} />
                </div>
              </CardContent>
            </Card>

            {lead.productInterest && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Interest</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-evari-text">{lead.productInterest}</p>
                </CardContent>
              </Card>
            )}

            {lead.notes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Owner notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-evari-dim leading-relaxed whitespace-pre-wrap">
                    {lead.notes}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Activity timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityTimeline activity={lead.activity} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Source attribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <KV k="Source" v={<SourceBadge source={lead.source} />} />
                {lead.utm?.source && <KV k="utm_source" v={<span className="font-mono">{lead.utm.source}</span>} />}
                {lead.utm?.medium && <KV k="utm_medium" v={<span className="font-mono">{lead.utm.medium}</span>} />}
                {lead.utm?.campaign && <KV k="utm_campaign" v={<span className="font-mono">{lead.utm.campaign || '—'}</span>} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Owner</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-evari-text">{lead.ownerName ?? 'Unassigned'}</div>
                {lead.nextActionAt && (
                  <div className="mt-2 text-xs text-evari-dim">
                    Next action: <span className="text-evari-text">{relativeTime(lead.nextActionAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-0.5">
        {label}
      </div>
      <div className="text-sm font-mono tabular-nums text-evari-text capitalize">{value}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-evari-dimmer">{k}</div>
      <div className="text-evari-text">{v}</div>
    </div>
  );
}
