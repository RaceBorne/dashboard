import { TopBar } from '@/components/sidebar/TopBar';
import { DiscoverClient } from '@/components/discover/DiscoverClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays } from '@/lib/dashboard/repository';

export default async function DiscoverPage() {
  const supabase = createSupabaseAdmin();
  const plays = supabase ? await listPlays(supabase) : [];
  const playOptions = plays.map((p) => ({ id: p.id, title: p.title, category: p.category }));

  return (
    <>
      <TopBar
        title="Discover"
        subtitle="Find companies and email addresses beyond the pipeline"
      />
      <DiscoverClient plays={playOptions} />
    </>
  );
}
