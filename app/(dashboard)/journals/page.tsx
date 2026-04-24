import { TopBar } from '@/components/sidebar/TopBar';
import { JournalsClient } from '@/components/journals/JournalsClient';
import { listDrafts, type JournalDraft } from '@/lib/journals/repository';
import { listArticles, listBlogs, type ShopifyArticle, type ShopifyBlog } from '@/lib/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /journals — the unified long-form surface.
 *
 * Two lanes: "CS+ | Bike Builds" and "Blogs". Each lane shows live
 * Shopify articles (the already-published body of work) plus any
 * dashboard drafts targeted at that lane. The composer lives one
 * route deeper at /journals/[id].
 *
 * We ask Shopify which blogs exist at render time — if CS+ and Blogs
 * are two separate blogs we show one tab per blog; if they're one
 * blog we still show the two lanes and split by tag as a fallback.
 */
export default async function JournalsPage() {
  const [blogsRaw, drafts, articles] = await Promise.all([
    listBlogs().catch(() => [] as ShopifyBlog[]),
    listDrafts(),
    listArticles({ first: 50, maxPages: 3 }).catch(() => [] as ShopifyArticle[]),
  ]);
  return (
    <>
      <TopBar
        title="Journals"
        subtitle="CS+ Bike Builds and Blogs, drafted and published"
      />
      <JournalsClient
        blogs={blogsRaw}
        drafts={drafts as JournalDraft[]}
        articles={articles}
      />
    </>
  );
}
