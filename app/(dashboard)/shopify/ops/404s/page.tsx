import { TopBar } from '@/components/sidebar/TopBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, Plug } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * 404 monitor stub.
 *
 * Shopify itself does not surface 404s through the Admin API — they're
 * an analytics concern. To make this page actionable we'd ingest from
 * one of:
 *   - Vercel Analytics (server-side `notFound()` events)
 *   - Plausible / Fathom (custom 404 event)
 *   - the storefront's own theme `404.liquid` posting to a webhook
 *
 * Until the data source is wired up the page renders a clear plan + a
 * jump straight to the redirects manager (which is the fix path once a
 * 404 is identified).
 */
export default function NotFoundsPage() {
  return (
    <>
      <TopBar title="404 monitor" subtitle="Ops" />
      <div className="p-6 max-w-3xl">
        <div className="rounded-xl bg-evari-surface p-6 ring-1 ring-evari-edge/40">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="warning" className="text-[10px] uppercase">data source needed</Badge>
            <span className="text-xs text-evari-dim">Milestone 8</span>
          </div>
          <h2 className="text-base font-medium text-evari-text mb-2">
            Track top 404s on the storefront
          </h2>
          <p className="text-sm text-evari-dim leading-relaxed">
            Shopify Admin doesn't expose 404 events. To populate this page we
            need an analytics source posting hits + missing-paths into the
            dashboard. Two cheap routes:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-evari-dim list-disc pl-5">
            <li>
              Add a <code className="text-evari-text font-mono">/api/storefront/404</code> route here
              and POST from <code className="text-evari-text font-mono">404.liquid</code> with{' '}
              <code className="text-evari-text font-mono">{'{{ request.path }}'}</code> + referrer.
            </li>
            <li>
              Pull from Vercel Analytics or Plausible's API on a 1-hour cron
              and rank hostless paths by hits.
            </li>
          </ul>
          <div className="mt-5 flex items-center gap-2">
            <Button asChild variant="primary" size="sm">
              <Link href="/shopify/ops/redirects">
                <Plug className="h-3 w-3" /> Manage redirects <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/shopify/seo-health">Run SEO health scan</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-evari-surfaceSoft p-4 text-xs text-evari-dim">
          Once the data source lands, this page will render a sortable list
          of paths × hits × first-seen, with a "create redirect for this"
          shortcut that opens the redirects modal pre-filled.
        </div>
      </div>
    </>
  );
}
