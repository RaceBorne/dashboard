import type { BriefingPayload } from '@/lib/types';
import { MOCK_TRAFFIC_30D, MOCK_TRAFFIC_SOURCES } from './traffic';
import { MOCK_LEADS } from './leads';
import { MOCK_AUDIT_FINDINGS } from './seo';
import { MOCK_SOCIAL_POSTS } from './social';
import { formatDelta, formatNumber, formatPercent } from '@/lib/utils';

export function getMockBriefing(): BriefingPayload {
  const last7 = MOCK_TRAFFIC_30D.slice(-7);
  const prior7 = MOCK_TRAFFIC_30D.slice(-14, -7);
  const sum = (arr: typeof MOCK_TRAFFIC_30D, k: keyof typeof MOCK_TRAFFIC_30D[number]) =>
    arr.reduce((a, b) => a + (b[k] as number), 0);
  const sessions7 = sum(last7, 'sessions');
  const sessions7p = sum(prior7, 'sessions');
  const conversions7 = sum(last7, 'conversions');
  const conversions7p = sum(prior7, 'conversions');
  const sessionsDelta = (sessions7 - sessions7p) / sessions7p;
  const conversionsDelta = (conversions7 - conversions7p) / conversions7p;

  const newLeads24h = MOCK_LEADS.filter((l) => {
    const ms = Date.now() - new Date(l.firstSeenAt).getTime();
    return ms < 24 * 3600 * 1000;
  }).length;

  const awaitingReply = MOCK_LEADS.filter(
    (l) => l.stage === 'discovery' || l.stage === 'configuring' || l.stage === 'new',
  ).length;

  const criticalAudits = MOCK_AUDIT_FINDINGS.filter((f) => f.severity === 'critical').length;
  const warningAudits = MOCK_AUDIT_FINDINGS.filter((f) => f.severity === 'warning').length;

  const today = new Date().toISOString().slice(0, 10);
  const scheduledToday = MOCK_SOCIAL_POSTS.filter(
    (p) => p.status === 'scheduled' && p.scheduledFor?.startsWith(today),
  ).length;

  const topSource = MOCK_TRAFFIC_SOURCES[0];

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      {
        label: 'Sessions, last 7 days',
        value: formatNumber(sessions7),
        delta: formatDelta(sessionsDelta),
        trend: sessionsDelta > 0 ? 'up' : sessionsDelta < 0 ? 'down' : 'flat',
        helper: `vs prior 7 (${formatNumber(sessions7p)})`,
      },
      {
        label: 'Conversions, last 7',
        value: formatNumber(conversions7),
        delta: formatDelta(conversionsDelta),
        trend: conversionsDelta > 0 ? 'up' : conversionsDelta < 0 ? 'down' : 'flat',
        helper: `${formatPercent(conversions7 / sessions7, 2)} CVR`,
      },
      {
        label: 'New leads, 24h',
        value: String(newLeads24h),
        helper: `${awaitingReply} awaiting your reply`,
      },
      {
        label: 'SEO findings',
        value: `${criticalAudits} critical · ${warningAudits} warn`,
        helper: 'See SEO Health',
      },
      {
        label: 'Top source, 7d',
        value: `${topSource.source} / ${topSource.medium}`,
        helper: `${formatNumber(topSource.sessions)} sessions · ${formatNumber(topSource.conversions)} conv.`,
      },
      {
        label: 'Posts scheduled today',
        value: String(scheduledToday),
        helper: 'across LinkedIn, Instagram, TikTok',
      },
    ],
    anomalies: [
      {
        id: 'an_sitemap',
        severity: 'critical',
        title: 'sitemap.xml is returning 500',
        detail:
          'evari.cc/sitemap.xml has been failing since the last theme deploy. Search Console reports the sitemap as unreadable. New journal entries and product pages are not being indexed reliably.',
        link: { label: 'Open in SEO Health', href: '/seo' },
      },
      {
        id: 'an_lcp',
        severity: 'warning',
        title: 'Tour PDP mobile LCP at 3.8s',
        detail:
          'The hero image on /products/evari-tour is loading at 1.4 MB. PageSpeed flags this as the dominant cause of a poor mobile LCP. The page receives 1,840 sessions/month at 2.8% conversion — this fix is high-value.',
        link: { label: 'Open in SEO Health', href: '/seo' },
      },
      {
        id: 'an_aurora',
        severity: 'info',
        title: 'Aurora Architects awaiting your reply',
        detail:
          'Sarah Mitchell asked about cycle-to-work limits eight hours ago. Six potential commuters at corporate value.',
        link: { label: 'Open conversation', href: '/conversations' },
      },
    ],
    contextForAI: [
      `Date: ${new Date().toDateString()}`,
      `Sessions last 7d: ${formatNumber(sessions7)} (${formatDelta(sessionsDelta)} vs prior 7).`,
      `Conversions last 7d: ${formatNumber(conversions7)} (${formatDelta(conversionsDelta)} vs prior 7).`,
      `New leads in last 24h: ${newLeads24h}. Awaiting reply: ${awaitingReply}.`,
      `Top source: ${topSource.source} / ${topSource.medium}, ${formatNumber(topSource.sessions)} sessions, ${formatNumber(topSource.conversions)} conversions.`,
      `Critical SEO findings: ${criticalAudits}. Warnings: ${warningAudits}.`,
      'Critical: sitemap.xml 500 since last deploy. Likely blocking indexing of new pages.',
      'Critical: /products/evari-tour mobile LCP 3.8s — hero image is 1.4 MB unoptimised.',
      'Open hot lead: James Pemberton (Tour configuration, £8,500), test ride booked Saturday — bringing his wife.',
      'Open conversation needs reply: Sarah Mitchell at Aurora Architects, six commuter pair purchase via cycle-to-work scheme.',
      'Quoted, awaiting decision: Phoebe Carrington — bespoke Evari Tour with champagne pearl Kustomflow finish (£11,200), paint slot held until Friday.',
      'Won this week: Eleanor Whitcombe — Evari Tour, Burnt Sienna, ships Tuesday. Marketing photo opportunity in North Yorkshire.',
    ].join('\n'),
  };
}
