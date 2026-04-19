import { TopBar } from '@/components/sidebar/TopBar';
import { WireframeDiagram } from '@/components/wireframe/WireframeDiagram';
import { WIREFRAME_NODES } from '@/lib/wireframe';

// Force dynamic rendering so env var changes take effect on the next page
// load — no rebuild required. Otherwise Next would static-prerender this
// page at build time with whatever env vars existed then.
export const dynamic = 'force-dynamic';

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

  // Per-node live signals — currently just GitHub's "last backed up" but
  // structured as a map so we can add Supabase last-migration, Vercel
  // last-deploy, Shopify last-sync, etc. without changing the component
  // contract again.
  const lastCommit = await fetchLastCommit();
  const nodeMeta: Record<string, { caption: string; tooltip?: string }> = {};
  if (lastCommit) {
    nodeMeta.github = {
      caption: `Saved ${formatRelative(lastCommit.isoTime)}`,
      tooltip: `${lastCommit.sha} · ${lastCommit.author}\n${lastCommit.message}`,
    };
  } else {
    nodeMeta.github = {
      caption: 'Backup status unavailable',
      tooltip:
        'GitHub commit lookup failed. Add a GITHUB_TOKEN env var so the wireframe can read commit history from the private repo.',
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

  return (
    <>
      <TopBar title="Wireframe" subtitle="system architecture — live" />
      <div className="px-6 py-6 space-y-8">
        <WireframeDiagram
          envPresent={envPresent}
          identifierValues={identifierValues}
          nodeMeta={nodeMeta}
        />

        {/* Order-of-work guidance */}
        <div className="rounded-xl bg-evari-surface px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
            Order of work
          </div>
          <ol className="mt-2 space-y-2 text-sm text-evari-dim leading-relaxed">
            <li>
              <span className="text-evari-text font-medium">1. GitHub</span>{' '}
              — push the repo. Free. Everything else deploys from here.
            </li>
            <li>
              <span className="text-evari-text font-medium">2. Vercel</span>{' '}
              — link the GitHub repo. First deploy is live in minutes. Also
              unlocks the AI Gateway and scheduled cron.
            </li>
            <li>
              <span className="text-evari-text font-medium">3. Supabase</span>{' '}
              — provision via Vercel Marketplace so DATABASE_URL flows into
              Vercel automatically. Dashboard stops using mock data.
            </li>
            <li>
              <span className="text-evari-text font-medium">4. Shopify</span>{' '}
              — custom app + Admin API token. Products, orders, abandoned
              carts flow in; meta updates + draft orders flow back.
            </li>
            <li>
              <span className="text-evari-text font-medium">5. Klaviyo</span>{' '}
              — private API key. Subscribers become the same dataset as
              leads; newsletters schedule from the dashboard.
            </li>
            <li>
              <span className="text-evari-text font-medium">6. Gmail</span>{' '}
              — one Google OAuth covers Gmail + Search Console + GA4 +
              Business Profile. Four services, one token.
            </li>
            <li>
              <span className="text-evari-text font-medium">
                7. SEMrush / DataForSEO
              </span>{' '}
              — SEO data last. Read-only, nothing depends on it, plug in
              whenever the budget allows.
            </li>
          </ol>
        </div>

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
      </div>
    </>
  );
}
