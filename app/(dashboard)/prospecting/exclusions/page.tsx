import { TopBar } from '@/components/sidebar/TopBar';
import { ExclusionsClient } from '@/components/prospecting/ExclusionsClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ExclusionRow {
  domain: string;
  reason: string | null;
  blocked_by_play: string | null;
  created_at: string;
}

async function loadExclusions(): Promise<ExclusionRow[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from('dashboard_blocked_domains')
    .select('domain, reason, blocked_by_play, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  return (data ?? []) as ExclusionRow[];
}

export default async function ProspectingExclusionsPage() {
  const initial = await loadExclusions();
  return (
    <>
      <TopBar title="Prospecting exclusions" subtitle="Domains blocked from every Discovery search" />
      <ExclusionsClient initial={initial} />
    </>
  );
}
