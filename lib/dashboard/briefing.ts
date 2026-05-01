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

// Build the real anomalies / 'what's worth your attention' panel from
// live data. Each row is one item the operator should act on. We pull
// from a handful of sources and rank by severity, then trim to the top
// few so the panel doesn't become a wall.
async function buildRealAnomalies(
  supabase: SupabaseClient | null,
  leads: { stage: string; lastTouchAt: string; firstSeenAt: string; fullName: string; id: string; estimatedValue?: number | null }[],
  auditFindings: { severity: string; title?: string; description?: string; pageUrl?: string }[],
): Promise<{ id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; link?: { label: string; href: string } }[]> {
  const out: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; link?: { label: string; href: string } }[] = [];

  // 1. Critical SEO findings.
  const crits = auditFindings.filter((f) => f.severity === 'critical');
  for (const f of crits.slice(0, 2)) {
    out.push({
      id: 'seo_' + (f.pageUrl ?? f.title ?? Math.random().toString(36).slice(2)),
      severity: 'critical',
      title: f.title ?? 'SEO critical finding',
      detail: f.description ?? (f.pageUrl ? 'Issue on ' + f.pageUrl : 'Open SEO Health for full detail.'),
      link: { label: 'Open in SEO Health', href: '/seo' },
    });
  }

  // 2. Pending follow-ups (smart follow-up scan output).
  if (supabase) {
    try {
      const { data: followups } = await supabase
        .from('dashboard_mkt_followups')
        .select('id, lead_id, reason, suggested_at')
        .eq('status', 'pending')
        .order('suggested_at', { ascending: false })
        .limit(3);
      const rows = (followups ?? []) as Array<{ id: string; lead_id: string; reason: string | null; suggested_at: string }>;
      for (const r of rows) {
        out.push({
          id: 'fu_' + r.id,
          severity: 'info',
          title: 'Follow-up suggested',
          detail: r.reason ?? 'A lead has gone quiet. Worth a nudge.',
          link: { label: 'Open Statistics', href: '/email/statistics' },
        });
      }
    } catch { /* table missing, skip */ }
  }

  // 3. Held recipients on any campaign (held by AI safety check, awaiting review).
  if (supabase) {
    try {
      const { count } = await supabase
        .from('dashboard_mkt_held_recipients')
        .select('id', { count: 'exact', head: true });
      if (count && count > 0) {
        out.push({
          id: 'held_recipients',
          severity: 'warning',
          title: count + ' recipient' + (count === 1 ? '' : 's') + ' held for review',
          detail: 'AI safety flagged them at send time. Approve or remove before the next send.',
          link: { label: 'Review held', href: '/email/campaigns' },
        });
      }
    } catch { /* table missing, skip */ }
  }

  // 4. Open tasks from the tasks board, ordered by priority and due date.
  if (supabase) {
    try {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, description, priority, due_date, status, category')
        .neq('status', 'done')
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(6);
      const rows = (tasks ?? []) as Array<{ id: string; title: string; description: string | null; priority: string; due_date: string | null; status: string; category: string }>;
      for (const t of rows) {
        const sev: 'critical' | 'warning' | 'info' =
          t.priority === 'urgent' ? 'critical'
            : t.priority === 'high' ? 'warning'
            : 'info';
        const dueLabel = t.due_date ? ' · due ' + t.due_date.slice(0, 10) : '';
        out.push({
          id: 'task_' + t.id,
          severity: sev,
          title: t.title,
          detail: (t.description ?? 'Open task') + dueLabel,
          link: { label: 'Open tasks', href: '/tasks' },
        });
      }
    } catch { /* table missing, skip */ }
  }

  // 5. Stale hot leads (>5 days no touch, currently in pipeline).
  const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
  const stale = leads.filter((l) => {
    if (!['configuring', 'discovery', 'quoted', 'contacted'].includes(l.stage)) return false;
    const t = l.lastTouchAt ? new Date(l.lastTouchAt).getTime() : 0;
    return t > 0 && t < fiveDaysAgo;
  });
  if (stale.length > 0) {
    const top = stale.slice(0, 1)[0];
    out.push({
      id: 'stale_' + top.id,
      severity: 'warning',
      title: stale.length + ' hot lead' + (stale.length === 1 ? '' : 's') + ' stale > 5 days',
      detail: 'Top: ' + top.fullName + (top.estimatedValue ? ' (~' + Math.round(top.estimatedValue) + ')' : '') + '. Total ' + stale.length + ' need a nudge.',
      link: { label: 'Open Leads', href: '/leads' },
    });
  }

  // 5. Draft campaigns sitting > 24h.
  if (supabase) {
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: drafts } = await supabase
        .from('dashboard_mkt_campaigns')
        .select('id, name, updated_at')
        .eq('status', 'draft')
        .lt('updated_at', dayAgo)
        .order('updated_at', { ascending: true })
        .limit(2);
      const rows = (drafts ?? []) as Array<{ id: string; name: string; updated_at: string }>;
      for (const r of rows) {
        out.push({
          id: 'draft_' + r.id,
          severity: 'info',
          title: 'Draft campaign idle',
          detail: '"' + r.name + '" has been a draft for over a day.',
          link: { label: 'Open campaign', href: '/email/campaigns/' + r.id + '/edit' },
        });
      }
    } catch { /* table missing, skip */ }
  }

  // 6. Awaiting reply on conversation threads (last message inbound > 8h).
  if (supabase) {
    try {
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
      const { data: threads } = await supabase
        .from('dashboard_threads')
        .select('id, payload')
        .lt('payload->>lastMessageAt', new Date().toISOString())
        .gt('payload->>lastMessageAt', eightHoursAgo)
        .limit(20);
      type ThreadRow = { id: string; payload: { lastDirection?: string; subject?: string; leadName?: string } };
      const inboundOpen = ((threads ?? []) as ThreadRow[]).filter(
        (t) => t.payload?.lastDirection === 'inbound',
      );
      if (inboundOpen.length > 0) {
        const top = inboundOpen[0];
        out.push({
          id: 'reply_' + top.id,
          severity: 'info',
          title: (inboundOpen.length === 1 ? 'A conversation' : inboundOpen.length + ' conversations') + ' awaiting your reply',
          detail: top.payload?.leadName
            ? top.payload.leadName + ' · ' + (top.payload.subject ?? 'no subject')
            : 'Open conversations to see who.',
          link: { label: 'Open conversations', href: '/email/conversations' },
        });
      }
    } catch { /* table missing, skip */ }
  }

  // Cap to top 6 by severity, critical > warning > info, preserving insertion order.
  const sevWeight = (s: string) => (s === 'critical' ? 0 : s === 'warning' ? 1 : 2);
  out.sort((a, b) => sevWeight(a.severity) - sevWeight(b.severity));
  return out.slice(0, 6);
}


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

  const realAnomalies = await buildRealAnomalies(supabase, leads as any, auditFindings as any);

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
    anomalies: realAnomalies,
    contextForAI: [
      `Date: ${new Date().toDateString()}`,
      `Sessions last 7d: ${formatNumber(sessions7)} (${formatDelta(sessionsDelta)} vs prior 7).`,
      `Conversions last 7d: ${formatNumber(conversions7)} (${formatDelta(conversionsDelta)} vs prior 7).`,
      `New leads in last 24h: ${newLeads24h}. Awaiting reply: ${awaitingReply}.`,
      `Top source: ${topSource.source} / ${topSource.medium}, ${formatNumber(topSource.sessions)} sessions, ${formatNumber(topSource.conversions)} conversions.`,
      `Critical SEO findings: ${criticalAudits}. Warnings: ${warningAudits}.`,
      formatGmailContextLine(overnightGmail, overnightSupport, overnightKlaviyoReply),
      ...formatOvernightGmailDetail(overnightGmail),
      ...realAnomalies.map((a) => a.severity.toUpperCase() + ': ' + a.title + '. ' + a.detail),
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
): Promise<(GeneratedBriefing & { updatedAt: string }) | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('dashboard_briefings')
    .select('brief_date, markdown, payload, source, mock, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    brief_date: string;
    markdown: string;
    payload: BriefingPayload;
    source: 'cron' | 'manual';
    mock: boolean;
    updated_at: string;
  };
  return {
    date: row.brief_date,
    markdown: row.markdown,
    payload: row.payload,
    source: row.source,
    mock: row.mock,
    updatedAt: row.updated_at,
  };
}
