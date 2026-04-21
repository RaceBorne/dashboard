import type { SupabaseClient } from '@supabase/supabase-js';
import type { BriefingPayload, GmailThreadSummary } from '@/lib/types';
import { formatDelta, formatNumber, formatPercent } from '@/lib/utils';
import {
  listAuditFindings,
  listLeads,
  listSocialPosts,
  listTrafficDays,
  listTrafficSources,
} from '@/lib/dashboard/repository';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { morningBriefingPrompt } from '@/lib/ai/prompts';
import { listCachedGmailThreads } from '@/lib/integrations/gmail';

export async function buildBriefingPayload(
  supabase: SupabaseClient | null,
): Promise<BriefingPayload> {
  const [trafficDays, leads, auditFindings, socialPosts, trafficSources, gmailThreads] =
    await Promise.all([
      listTrafficDays(supabase),
      listLeads(supabase),
      listAuditFindings(supabase),
      listSocialPosts(supabase),
      listTrafficSources(supabase),
      listCachedGmailThreads({ limit: 20 }),
    ]);

  const last7 = trafficDays.slice(-7);
  const prior7 = trafficDays.slice(-14, -7);
  const sum = (arr: typeof trafficDays, k: keyof (typeof trafficDays)[number]) =>
    arr.reduce((a, b) => a + (b[k] as number), 0);
  const sessions7 = sum(last7, 'sessions');
  const sessions7p = sum(prior7, 'sessions');
  const conversions7 = sum(last7, 'conversions');
  const conversions7p = sum(prior7, 'conversions');
  const sessionsDelta = sessions7p > 0 ? (sessions7 - sessions7p) / sessions7p : 0;
  const conversionsDelta = conversions7p > 0 ? (conversions7 - conversions7p) / conversions7p : 0;

  const newLeads24h = leads.filter((l) => {
    const ms = Date.now() - new Date(l.firstSeenAt).getTime();
    return ms < 24 * 3600 * 1000;
  }).length;

  const awaitingReply = leads.filter(
    (l) => l.stage === 'discovery' || l.stage === 'configuring' || l.stage === 'new',
  ).length;

  const criticalAudits = auditFindings.filter((f) => f.severity === 'critical').length;
  const warningAudits = auditFindings.filter((f) => f.severity === 'warning').length;

  const today = new Date().toISOString().slice(0, 10);
  const scheduledToday = socialPosts.filter(
    (p) => p.status === 'scheduled' && p.scheduledFor?.startsWith(today),
  ).length;

  const topSource = trafficSources[0] ?? {
    source: '—',
    medium: '—',
    sessions: 0,
    conversions: 0,
    conversionRate: 0,
  };

  const cvr =
    sessions7 > 0 ? formatPercent(conversions7 / sessions7, 2) : formatPercent(0, 2);

  // Gmail rollup — threads that arrived in the last 24h, and a breakdown by
  // category so the briefing can say "5 new customer threads overnight".
  const overnightCutoff = Date.now() - 24 * 3600 * 1000;
  const overnightGmail = gmailThreads.filter(
    (t) => new Date(t.lastMessageAt).getTime() >= overnightCutoff,
  );
  const overnightSupport = overnightGmail.filter((t) => t.category === 'support');
  const overnightKlaviyoReply = overnightGmail.filter((t) => t.category === 'klaviyo-reply');

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
        helper: `${cvr} CVR`,
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
      {
        label: 'Inbox, last 24h',
        value: String(overnightGmail.length),
        helper:
          overnightGmail.length > 0
            ? `${overnightSupport.length} customer · ${overnightKlaviyoReply.length} klaviyo reply`
            : 'Nothing overnight',
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
      formatGmailContextLine(overnightGmail, overnightSupport, overnightKlaviyoReply),
      ...formatOvernightGmailDetail(overnightGmail),
      'Critical: sitemap.xml 500 since last deploy. Likely blocking indexing of new pages.',
      'Critical: /products/evari-tour mobile LCP 3.8s — hero image is 1.4 MB unoptimised.',
      'Open hot lead: James Pemberton (Tour configuration, £8,500), test ride booked Saturday — bringing his wife.',
      'Open conversation needs reply: Sarah Mitchell at Aurora Architects, six commuter pair purchase via cycle-to-work scheme.',
      'Quoted, awaiting decision: Phoebe Carrington — bespoke Evari Tour with champagne pearl Kustomflow finish (£11,200), paint slot held until Friday.',
      'Won this week: Eleanor Whitcombe — Evari Tour, Burnt Sienna, ships Tuesday. Marketing photo opportunity in North Yorkshire.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * "Overnight inbox: 4 threads (3 customer, 1 klaviyo-reply)." Or the empty
 * "Overnight inbox: nothing." We keep this as a single line in contextForAI
 * because the detail lines come right after.
 */
function formatGmailContextLine(
  overnight: GmailThreadSummary[],
  support: GmailThreadSummary[],
  klaviyoReply: GmailThreadSummary[],
): string {
  if (overnight.length === 0) return 'Overnight inbox: no new threads in the last 24h.';
  return `Overnight inbox: ${overnight.length} new threads in 24h — ${support.length} customer · ${klaviyoReply.length} klaviyo reply.`;
}

/**
 * Up to 5 per-thread detail lines so the morning briefing can call out
 * specific customers by name/subject. Outbound is deliberately excluded
 * here — "you sent 3 emails" isn't news to Craig.
 */
function formatOvernightGmailDetail(overnight: GmailThreadSummary[]): string[] {
  const inbound = overnight
    .filter((t) => t.category === 'support' || t.category === 'klaviyo-reply')
    .slice(0, 5);
  return inbound.map((t) => {
    const subject = t.subject.replace(/\s+/g, ' ').trim().slice(0, 100);
    const snippet = t.snippet.replace(/\s+/g, ' ').trim().slice(0, 120);
    return `Inbound [${t.category}]: "${subject}" — ${snippet}`;
  });
}

// ---------------------------------------------------------------------------
// Briefing generation + persistence. Called both by the 6am cron and by the
// on-demand POST /api/briefing. Upserts into dashboard_briefings keyed by
// today's date (Europe/London) — a same-day regenerate replaces the
// morning row rather than appending.
// ---------------------------------------------------------------------------

export interface GeneratedBriefing {
  date: string; // YYYY-MM-DD (Europe/London)
  markdown: string;
  payload: BriefingPayload;
  mock: boolean;
  source: 'cron' | 'manual';
}

const LONDON_TZ = 'Europe/London';

function londonDateISO(d = new Date()): string {
  // Intl.DateTimeFormat with the London timezone reliably handles BST/GMT.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

const FALLBACK_MARKDOWN = `### Offline briefing
AI Gateway is not reachable — run \`vercel env pull\` or set \`ANTHROPIC_API_KEY\` so Claude can generate a real briefing. The numbers below are live; the commentary is stubbed.`;

/**
 * Generate the morning briefing and upsert it into dashboard_briefings.
 *
 * If the AI Gateway isn't configured we still persist the row so the UI has
 * something to render — `mock: true` flags it.
 */
export async function generateAndPersistBriefing(
  supabase: SupabaseClient | null,
  opts: { source?: 'cron' | 'manual' } = {},
): Promise<GeneratedBriefing> {
  const payload = await buildBriefingPayload(supabase);
  const date = londonDateISO();
  const source = opts.source ?? 'manual';

  let markdown = FALLBACK_MARKDOWN;
  let mock = true;

  if (hasAIGatewayCredentials()) {
    try {
      markdown = await generateBriefing({
        task: 'Morning briefing for the founder',
        voice: 'analyst',
        prompt: morningBriefingPrompt(payload),
      });
      mock = false;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      markdown = `${FALLBACK_MARKDOWN}\n\n> AI Gateway call failed: ${reason}`;
      mock = true;
    }
  }

  // Persist. Upsert keyed by date so a same-day regenerate overwrites.
  if (supabase) {
    const up = await supabase.from('dashboard_briefings').upsert(
      {
        brief_date: date,
        markdown,
        payload,
        source,
        mock,
      },
      { onConflict: 'brief_date' },
    );
    if (up.error) {
      // Don't fail the caller if persist blows up — log and return the
      // generated briefing anyway. The most common cause is the migration
      // not being applied yet on a fresh env.
      console.warn(`[briefing persist] upsert failed: ${up.error.message}`);
    }
  }

  return { date, markdown, payload, mock, source };
}

/**
 * Fetch the most recent persisted briefing, or null if the table is empty.
 * Used by GET /api/briefing to return cached output instantly.
 */
export async function readLatestBriefing(
  supabase: SupabaseClient | null,
): Promise<GeneratedBriefing | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('dashboard_briefings')
    .select('brief_date, markdown, payload, source, mock')
    .order('brief_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    brief_date: string;
    markdown: string;
    payload: BriefingPayload;
    source: 'cron' | 'manual';
    mock: boolean;
  };
  return {
    date: row.brief_date,
    markdown: row.markdown,
    payload: row.payload,
    source: row.source,
    mock: row.mock,
  };
}
