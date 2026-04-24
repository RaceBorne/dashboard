import { TopBar } from '@/components/sidebar/TopBar';
import { NewPostClient } from '@/components/social/NewPostClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /articles — unified long-form composer.
 *
 * Phase 1 opens the composer locked to Shopify blog (the most common
 * long-form destination). Phase 2 will swap this for a unified editor
 * with a destination toggle — write once, publish to Shopify blog and/or
 * Klaviyo newsletter from the same draft.
 */
export default function ArticlesPage() {
  return (
    <>
      <TopBar
        title="Articles"
        subtitle="Long-form for the Shopify blog and newsletter"
      />
      <NewPostClient lockedPlatform="shopify_blog" />
    </>
  );
}
