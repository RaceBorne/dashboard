import { TopBar } from '@/components/sidebar/TopBar';
import { ArticlesClient } from '@/components/shopify/ArticlesClient';
import {
  getStorefrontBaseUrl,
  isShopifyConnected,
  listArticles,
  listBlogs,
} from '@/lib/integrations/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ArticlesIndexPage() {
  const [articles, blogs, storefrontBaseUrl] = await Promise.all([
    listArticles({ first: 100, maxPages: 3 }),
    listBlogs(),
    getStorefrontBaseUrl(),
  ]);
  return (
    <>
      <TopBar title="Articles" subtitle={`${articles.length} articles`} />
      <div className="p-6">
        <ArticlesClient
          initial={articles}
          blogs={blogs}
          mock={!isShopifyConnected()}
          storefrontBaseUrl={storefrontBaseUrl}
        />
      </div>
    </>
  );
}
