import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeadsAllTiers, listLeadsForGroup } from '@/lib/dashboard/repository';
import { getGroup } from '@/lib/marketing/groups';
import { LeadsClient } from '@/components/leads/LeadsClient';
import type { Lead } from '@/lib/types';

// Stage pages depend on ?playId= and per-request data, so opt out of
// static prerender. Without this, Next.js 16 fails the build with
// 'useSearchParams() should be wrapped in a suspense boundary' for any
// client component (FunnelRibbon, ProjectRail) that reads search params.
export const dynamic = 'force-dynamic';

interface PageProps { searchParams: Promise<{ listId?: string }> }

export default async function LeadsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sb = createSupabaseAdmin();
  // Scoped mode: when ?listId= is present, fetch only leads whose
  // contacts are members of that marketing group. Same chrome,
  // filtered data, list name surfaced as the active scope.
  let leads: Lead[];
  let scopedTo: { listId: string; listName: string; unpromotedCount: number } | null = null;
  if (sp.listId && sb) {
    const { leads: scoped, unpromotedContactCount } = await listLeadsForGroup(sb, sp.listId);
    const group = await getGroup(sp.listId);
    leads = scoped;
    scopedTo = {
      listId: sp.listId,
      listName: group?.name ?? '(unknown list)',
      unpromotedCount: unpromotedContactCount,
    };
  } else {
    leads = await listLeadsAllTiers(sb);
  }
  const counts = { total: leads.length, lead: 0, prospect: 0 };
  for (const l of leads) {
    if (l.tier === 'lead') counts.lead += 1;
    else if (l.tier === 'prospect') counts.prospect += 1;
  }
  return (
    <>
      <TopBar
        title={scopedTo ? scopedTo.listName : 'Leads'}
        subtitle={scopedTo
          ? `Email · List members · ${counts.total} lead${counts.total === 1 ? '' : 's'}${scopedTo.unpromotedCount > 0 ? ` · ${scopedTo.unpromotedCount} unpromoted contact${scopedTo.unpromotedCount === 1 ? '' : 's'}` : ''}`
          : `${counts.total} total · ${counts.lead} lead${counts.lead === 1 ? '' : 's'} · ${counts.prospect} prospect${counts.prospect === 1 ? '' : 's'}`}
      />
      <LeadsClient initialLeads={leads} scopedTo={scopedTo} />
    </>
  );
}
