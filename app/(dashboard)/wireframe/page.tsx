import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TopBar } from '@/components/sidebar/TopBar';
import { WireframeDiagram } from '@/components/wireframe/WireframeDiagram';
import { ConnectionsClient } from '@/components/connections/ConnectionsClient';
import { WIREFRAME_NODES } from '@/lib/wireframe';
import { getIntegrationStatuses } from '@/lib/integrations/status';

// Force dynamic rendering so env var changes take effect on the next page
// load — no rebuild required. Otherwise Next would static-prerender this
// page at build time with whatever env vars existed then.
export const dynamic = 'force-dynamic';

/**
 * Order-of-work steps. Each entry maps to a `WIREFRAME_NODES` id so the
 * "is this connected yet?" check uses the same source of truth as the
 * diagram and the connections list. When a step's integration flips to
 * connected, it drops out of the rendered list automatically.
 */
interface OrderStep {
  nodeId: string;
  label: string;
  blurb: string;
}
const ORDER_OF_WORK_STEPS: OrderStep[] = [
  {
    nodeId: 'github',
    label: 'GitHub',
    blurb: 'Push the repo. Free. Everything else deploys from here.',
  },
  {
    nodeId: 'vercel',
    label: 'Vercel',
    blurb:
      'Link the GitHub repo. First deploy is live in minutes. Also unlocks the AI Gateway and scheduled cron.',
  },
  {
    nodeId: 'supabase',
    label: 'Supabase',
    blurb:
      'Provision via Vercel Marketplace so DATABASE_URL flows into Vercel automatically. Dashboard stops using mock data.',
  },
  {
    nodeId: 'shopify',
    label: 'Shopify',
    blurb:
      'Custom app + Admin API token. Products, orders, abandoned carts flow in; meta updates + draft orders flow back.',
  },
  {
    nodeId: 'klaviyo',
    label: 'Klaviyo',
    blurb:
      'Private API key. Subscribers become the same dataset as leads; newsletters schedule from the dashboard.',
  },
  {
    nodeId: 'email',
    label: 'Gmail',
    blurb:
      'One Google OAuth covers Gmail + Search Console + GA4 + Business Profile. Four services, one token.',
  },
  {
    nodeId: 'dataforseo',
    label: 'DataForSEO',
    blurb:
      'SEO data last. Read-only, nothing depends on it, plug in whenever the budget allows.',
  },
];

/**
 * Renders only the outstanding setup steps. If `pending` is empty we show
 * a short "you're done" state instead of hiding the panel entirely — so
 * Craig has a moment of closure when the whole stack is wired up.
 */
function OrderOfWork({
  pending,
  totalSteps,
}: {
  pending: OrderStep[];
  totalSteps: number;
}) {
  if (pending.length === 0) {
    return (
      <div className="rounded-xl bg-evari-surface px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
          Order of work
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-evari-text">
          <span className="h-2 w-2 rounded-full bg-evari-success shrink-0" />
          All {totalSteps} services connected. Setup is done.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-evari-surface px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
          Order of work
        </div>
        <div className="text-[10px] text-evari-dimmer">
          {totalSteps - pending.length} of {totalSteps} done
        </div>
      </div>
      <ol className="mt-2 space-y-2 text-sm text-evari-dim leading-relaxed">
        {pending.map((step, idx) => (
          <li key={step.nodeId} className="flex gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-evari-warn shrink-0 mt-[0.55rem]"
              aria-hidden
            />
            <div>
              <span className="text-evari-text font-medium">
                {idx + 1}. {step.label}
              </span>{' '}
              — {step.blurb}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Fetch the most recent commit on main from GitHub. Optional GITHUB_TOKEN
 * lets us read private repos; without it, only public repos return data.
 * Result is cached for 60s to avoid hammering the API on every page hit.
 *
 * Returns ISO timestamp + short SHA + author + message, or null if the
 * lookup fails for any reason (no token, network issue, rate limit).
 */
async function fetchLastCommit(): Promise<{
  isoTime: string;
  sha: string;
  author: string;
  message: string;
} | null> {
  const repo = 'RaceBorne/dashboard';
  const url = `https://api.github.com/repos/${repo}/commits/main`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data: {
      sha: string;
      commit: {
        author: { name: string; date: string };
        message: string;
      };
    } = await res.json();
    return {
      isoTime: data.commit.author.date,
      sha: data.sha.slice(0, 7),
      author: data.commit.author.name,
      message: data.commit.message.split('\n')[0],
    };
  } catch {
    return null;
  }
}

/** Compact "5m ago / 2h ago / 3d ago" — the kind of thing you'd see in a
 *  GitHub feed. Falls back to the date once we get past a week. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'recently';
  const diffMs = Date.now() - then;
  const sec = Math.max(1, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Detect whether this checkout is linked to a Vercel project. True when
 * either we're running on Vercel itself (`process.env.VERCEL`) or when a
 * local `.vercel/project.json` exists (i.e. someone ran `vercel link`).
 * This is the "fundamentally connected to Vercel" signal — independent
 * of whether the page happens to be rendering from a deploy or a laptop.
 */
async function isVercelLinked(): Promise<boolean> {
  if (process.env.VERCEL) return true;
  try {
    await fs.access(path.join(process.cwd(), '.vercel', 'project.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cheap Supabase liveness check. Hits `/auth/v1/health`, which is the
 * public health endpoint — returns 200 if the project is up. We send the
 * anon key as `apikey` because Supabase rejects unauthenticated calls
 * even on health (returns 401 with "no API key found in request").
 */
async function fetchSupabaseHealth(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;
  const headers: Record<string, string> = {};
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    headers.apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers,
      next: { revalidate: 60 },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Wireframe — a live architecture diagram showing how every service in the
 * Evari stack connects, and what each costs. Boxes flip from grey to green
 * when the matching env vars are present. Primarily aimed at Craig + his
 * partner so they can see the full system at a glance, and dig into the
 * bidirectional flows on click.
 */
export default async function WireframePage() {
  // Which env vars exist (used for green/grey dots)
  const allEnvVars = new Set<string>();
  for (const n of WIREFRAME_NODES) for (const v of n.envVars) allEnvVars.add(v);
  const envPresent = new Set<string>();
  for (const v of allEnvVars) {
    if (process.env[v] && process.env[v]!.length > 0) envPresent.add(v);
  }

  // Per-node live status — once a service is connected, the wireframe
  // box swaps its static role description (e.g. "Postgres + auth + storage")
  // for the live status (e.g. "Database healthy"). Designed as a map so
  // every other service can hang its own probe-derived status here without
  // touching the component contract.
  const [lastCommit, supabaseHealthy, vercelLinked] = await Promise.all([
    fetchLastCommit(),
    fetchSupabaseHealth(),
    isVercelLinked(),
  ]);

  // Synthetic markers — set whenever a fundamental connection is proven,
  // independent of which env this page happens to render from. GitHub is
  // "live" if the commits API responded; Vercel is "linked" if either
  // we're on Vercel runtime OR `.vercel/project.json` exists locally.
  if (lastCommit) envPresent.add('__GITHUB_LIVE');
  if (vercelLinked) envPresent.add('__VERCEL_LINKED');
  // AI Gateway is "live" when ANY of the following holds:
  //   1. A static AI_GATEWAY_API_KEY is set (manual key path).
  //   2. A Vercel OIDC token is in process.env (local dev after
  //      `vercel env pull`, or Pro/Enterprise runtime where it's surfaced).
  //   3. We're running on a Vercel deployment at all (process.env.VERCEL).
  //      Every Vercel project can call AI Gateway — auth is handled by
  //      the platform even when the OIDC env var isn't surfaced (Hobby).
  if (
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN ||
    process.env.VERCEL
  ) {
    envPresent.add('__AI_GATEWAY_LIVE');
  }
  const nodeMeta: Record<string, { liveStatus: string; tooltip?: string }> = {};
  if (lastCommit) {
    const ago = formatRelative(lastCommit.isoTime);
    nodeMeta.github = {
      liveStatus: `Saved ${ago}`,
      tooltip: `${lastCommit.sha} · ${lastCommit.author}\n${lastCommit.message}`,
    };
    // Vercel auto-deploys main on push, so the same commit time is the
    // best proxy for "when this code went live" without a Vercel API
    // round-trip per page load.
    nodeMeta.vercel = {
      liveStatus: `Deployed ${ago}`,
      tooltip: `Auto-deployed from ${lastCommit.sha} on main\n${lastCommit.message}`,
    };
  }
  if (supabaseHealthy) {
    nodeMeta.supabase = {
      liveStatus: 'Database healthy',
      tooltip: 'Supabase /auth/v1/health returned 200 OK',
    };
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    nodeMeta['aigateway'] = {
      liveStatus: 'Gateway ready',
      tooltip: 'AI_GATEWAY_API_KEY present — direct gateway calls enabled',
    };
  } else if (process.env.VERCEL_OIDC_TOKEN) {
    nodeMeta['aigateway'] = {
      liveStatus: 'Gateway ready (OIDC)',
      tooltip: 'Authenticating via Vercel OIDC token — no static key needed',
    };
  } else if (process.env.VERCEL) {
    nodeMeta['aigateway'] = {
      liveStatus: 'Gateway ready (Vercel runtime)',
      tooltip: 'Vercel platform handles AI Gateway auth automatically',
    };
  }

  // Non-secret identifier values (username, store domain, email) passed
  // to the client so we can show "logged in as …" without ever exposing a
  // secret. Only env vars explicitly referenced as `account.identifierEnvVar`
  // get their values surfaced — tokens and keys stay server-side.
  const identifierEnvVars = new Set<string>();
  for (const n of WIREFRAME_NODES) {
    if (n.account?.identifierEnvVar) identifierEnvVars.add(n.account.identifierEnvVar);
  }
  const identifierValues: Record<string, string> = {};
  for (const v of identifierEnvVars) {
    if (process.env[v] && process.env[v]!.length > 0) {
      identifierValues[v] = process.env[v]!;
    }
  }

  // Connections list — derived from the same WIREFRAME_NODES the diagram
  // uses, with the *same* envPresent set so synthetic markers (GitHub,
  // Vercel, AI Gateway) light up identically in both views.
  const integrations = getIntegrationStatuses(envPresent);

  return (
    <>
      <TopBar title="Wireframe" subtitle="system architecture — live" />
      <div className="px-6 py-6 space-y-8">
        <WireframeDiagram
          envPresent={envPresent}
          identifierValues={identifierValues}
          nodeMeta={nodeMeta}
        />

        {/* Order-of-work guidance — only shows steps that are still outstanding.
            Each step maps to an integration node; once that node reports
            `connected`, the step drops out of the list and the remaining
            items are renumbered. When nothing's left, the panel flips to a
            short "you're done" state instead. */}
        <OrderOfWork
          pending={ORDER_OF_WORK_STEPS.filter((s) => {
            const match = integrations.find((i) => i.key === s.nodeId);
            return !match?.connected;
          })}
          totalSteps={ORDER_OF_WORK_STEPS.length}
        />

        {/* SEMrush deep-dive — Craig explicitly asked for this */}
        <div className="rounded-xl bg-evari-surface">
          <div className="px-5 py-4 bg-evari-surfaceSoft">
            <h2 className="text-sm font-medium tracking-tight text-evari-text">
              SEMrush — what we actually need and what we can replace
            </h2>
            <p className="text-xs text-evari-dim mt-1.5 leading-relaxed max-w-3xl">
              SEMrush is an all-in-one SEO suite. We don&apos;t need the UI
              because we&apos;re building our own. The question is which of
              its capabilities are genuinely load-bearing and which have a
              free or cheaper alternative.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <div className="px-5 py-4 border-t border-evari-edge">
              <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-3">
                Use it for (genuinely hard to replace)
              </div>
              <ul className="space-y-2 text-xs text-evari-text leading-relaxed">
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-gold" />
                  <span>
                    <strong>Keyword volumes + difficulty.</strong> The only
                    way to know if &ldquo;speed pedelec UK&rdquo; is worth
                    writing a post about is to see its search volume and how
                    hard the top 10 are to displace. Google doesn&apos;t
                    expose this — Keyword Planner gives bands, not numbers.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-gold" />
                  <span>
                    <strong>Competitor rank tracking.</strong> Daily SERP
                    positions for Riese &amp; M&uuml;ller, Stromer, Cowboy,
                    Tenways across UK locations. Lets us spot when we&apos;re
                    being overtaken on a money keyword.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-gold" />
                  <span>
                    <strong>Backlink discovery.</strong> Who links to
                    Stromer but not Evari? That&apos;s the outreach list. No
                    free tool has a crawler at this scale except Ahrefs (same
                    price).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-gold" />
                  <span>
                    <strong>Topic gap analysis.</strong> Queries competitors
                    rank for that we don&apos;t — the cleanest source of
                    blog post ideas.
                  </span>
                </li>
              </ul>
              <div className="mt-4 pt-3 border-t border-evari-edge text-xs text-evari-dim leading-relaxed">
                <strong className="text-evari-text">Recommended route:</strong>{' '}
                DataForSEO API (£60/mo at our usage) instead of SEMrush
                (£110/mo). Same underlying data, pipes directly into our own
                UI, no human dashboard we&apos;d never open.
              </div>
            </div>
            <div className="px-5 py-4 border-t border-evari-edge bg-evari-surfaceSoft/20">
              <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-3">
                Replace with free / cheap alternatives
              </div>
              <ul className="space-y-2 text-xs text-evari-dim leading-relaxed">
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer" />
                  <span>
                    <strong className="text-evari-text">Our own ranks + impressions + CTR</strong> →{' '}
                    Google Search Console. Free. Shows every query
                    we&apos;re ranking for with real data.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer" />
                  <span>
                    <strong className="text-evari-text">Site audit</strong>{' '}
                    (broken links, duplicate meta, redirect chains) →
                    Screaming Frog (£199/yr) or the free 500-URL tier. Also
                    Ahrefs Webmaster Tools (free) covers this.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer" />
                  <span>
                    <strong className="text-evari-text">Core Web Vitals + page speed</strong>{' '}
                    → PageSpeed Insights API. Free. Already scaffolded in
                    the dashboard.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer" />
                  <span>
                    <strong className="text-evari-text">Index coverage + mobile usability</strong>{' '}
                    → Google Search Console. Free.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer" />
                  <span>
                    <strong className="text-evari-text">Our own backlinks</strong>{' '}
                    → Google Search Console Links report. Free. Only covers
                    evari.cc though — doesn&apos;t see competitors.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer" />
                  <span>
                    <strong className="text-evari-text">Traffic numbers</strong>{' '}
                    (our own) → GA4. Free. SEMrush&apos;s traffic estimates
                    for competitors are modelled and often wrong.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-dimmer" />
                  <span>
                    <strong className="text-evari-text">Content ideas</strong>{' '}
                    → AlsoAsked, AnswerThePublic free tier, Reddit/Quora
                    queries. Free.
                  </span>
                </li>
              </ul>
              <div className="mt-4 pt-3 border-t border-evari-edge text-xs text-evari-dim leading-relaxed">
                <strong className="text-evari-text">If we skip SEMrush entirely:</strong>{' '}
                GSC + Screaming Frog + Lighthouse + Keyword Planner covers
                roughly 60% of the use-cases for £0/mo. We lose competitor
                visibility and precise keyword volumes. Fine if SEO is
                &ldquo;fix what&apos;s broken on evari.cc&rdquo; but blocks
                us from &ldquo;out-rank Stromer&rdquo;.
              </div>
            </div>
          </div>
        </div>

        {/* Per-integration detail. Each row collapses by default; click
            anywhere on a row to expand and see synopsis, scopes, and the
            required env vars. Categories are the same cluster ids as the
            diagram above, so the two views always agree. */}
        <div id="connections-list">
          <ConnectionsClient integrations={integrations} className="space-y-6" />
        </div>
      </div>
    </>
  );
}
