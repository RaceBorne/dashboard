import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getCountsPerPlay, listPlays } from '@/lib/dashboard/repository';
import { IdeasClient } from '@/components/plays/IdeasClient';
import { IdeasAIBinding } from '@/components/plays/IdeasAIBinding';

export const dynamic = 'force-dynamic';

export default async function VenturesPage() {
  const supabase = createSupabaseAdmin();
  const [plays, countsByPlay] = await Promise.all([
    listPlays(supabase),
    getCountsPerPlay(supabase),
  ]);
  return (
    <>
      <TopBar title="Ideas" subtitle="Prospecting · Capture, develop and organise new targeting concepts" />
      <IdeasAIBinding count={plays.length} />
      <IdeasClient plays={plays} counts={countsByPlay} />
    </>
  );
}
