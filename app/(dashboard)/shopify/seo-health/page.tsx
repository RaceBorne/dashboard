import { TopBar } from '@/components/sidebar/TopBar';
import { SeoHealthClient } from '@/components/shopify/SeoHealthClient';
import { isShopifyConnected } from '@/lib/integrations/shopify';
import { getCachedScan } from '@/lib/seo/scan';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams?: Promise<{ finding?: string }>;
}

/**
 * /shopify/seo-health — the audit + auto-fix engine.
 *
 * Server pre-loads the cached scan (if any) so the page paints with
 * data on first hit. The actual scan/rescan/fix flow is all client-side
 * via /api/seo/scan + /api/seo/fix + /api/seo/undo.
 */
export default async function SeoHealthPage({ searchParams }: PageProps) {
  const cached = getCachedScan();
  const sp = searchParams ? await searchParams : {};
  return (
    <>
      <TopBar
        title="SEO Health"
        subtitle={cached ? `score ${cached.score}/100` : 'no scan yet'}
      />
      <div className="p-6 max-w-[1500px]">
        <SeoHealthClient
          initial={cached}
          mock={!isShopifyConnected()}
          initialFindingId={sp.finding}
        />
      </div>
    </>
  );
}
