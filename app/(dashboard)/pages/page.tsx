import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listSeoPages } from '@/lib/dashboard/repository';
import { PagesClient } from '@/components/pages/PagesClient';

export default async function PagesPage() {
  const pages = await listSeoPages(createSupabaseAdmin());
  return (
    <>
      <TopBar title="Pages" subtitle={String(pages.length) + ' tracked'} />
      <PagesClient initialPages={pages} />
    </>
  );
}
