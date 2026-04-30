import { TopBar } from '@/components/sidebar/TopBar';
import { ExclusionsClient } from '@/components/prospecting/ExclusionsClient';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ExclusionRow {
  id: string;
  domain: string;
  reason: string | null;
  play_id: string | null;
  play_title: string | null;
  created_at: string;
}

async function loadExclusions(): Promise<ExclusionRow[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data: rows } = await sb
    .from('dashboard_blocked_domains')
    .select('id, domain, reason, play_id, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  const playIds = Array.from(
    new Set(((rows ?? []) as Array<{ play_id: string | null }>)
      .map((r) => r.play_id)
      .filter((v): v is string => !!v)),
  );
  const playTitles = new Map<string, string>();
  if (playIds.length > 0) {
    const { data: plays } = await sb
      .from('dashboard_plays')
      .select('id, payload')
      .in('id', playIds);
    for (const p of (plays ?? []) as Array<{ id: string; payload: { title?: string } }>) {
      playTitles.set(p.id, p.payload?.title ?? '(untitled)');
    }
  }
  return ((rows ?? []) as Array<{
    id: string;
    domain: string;
    reason: string | null;
    play_id: string | null;
    created_at: string;
  }>).map((r) => ({
    ...r,
    play_title: r.play_id ? playTitles.get(r.play_id) ?? null : null,
  }));
}

export default async function ProspectingExclusionsPage() {
  const initial = await loadExclusions();
  return (
    <>
      <TopBar title="Prospecting exclusions" subtitle="Domains blocked from Discovery search" />
      <ExclusionsClient initial={initial} />
    </>
  );
}
