import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listSeoKeywords } from '@/lib/dashboard/repository';
import { KeywordsClient } from '@/components/keywords/KeywordsClient';

export default async function KeywordsPage() {
  const keywords = await listSeoKeywords(createSupabaseAdmin());
  return (
    <>
      <TopBar
        title="Keywords"
        subtitle={String(keywords.length) + ' tracked'}
      />
      <KeywordsClient initialKeywords={keywords} />
    </>
  );
}
