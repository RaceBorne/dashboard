import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { JournalEditor } from '@/components/journals/JournalEditor';
import { getDraft } from '@/lib/journals/repository';
import { listBlogs } from '@/lib/shopify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function JournalEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [draft, blogs] = await Promise.all([getDraft(id), listBlogs().catch(() => [])]);
  if (!draft) notFound();
  return (
    <>
      <TopBar
        title={draft.title.trim() || 'Untitled journal'}
        subtitle={
          draft.shopifyArticleId
            ? 'Published — edits will update the live article'
            : 'Draft — not yet published to Shopify'
        }
      />
      <JournalEditor draft={draft} blogs={blogs} />
    </>
  );
}
