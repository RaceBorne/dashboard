import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listLeadsAllTiers } from '@/lib/dashboard/repository';
import { LeadsClient } from '@/components/leads/LeadsClient';

// Stage pages depend on ?playId= and per-request data, so opt out of
// static prerender. Without this, Next.js 16 fails the build with
// 'useSearchParams() should be wrapped in a suspense boundary' for any
// client component (FunnelRibbon, ProjectRail) that reads search params.
export const dynamic = 'force-dynamic';


export default async function LeadsPage() {
  // Pull every tier — Prospects + Leads share dashboard_leads, distinguished
  // only by the 'tier' field. The client carries a tier filter so the
  // operator can scope to either subset (or see them all).
  const leads = await listLeadsAllTiers(createSupabaseAdmin());
  const counts = { total: leads.length, lead: 0, prospect: 0 };
  for (const l of leads) {
    if (l.tier === 'lead') counts.lead += 1;
    else if (l.tier === 'prospect') counts.prospect += 1;
  }
  return (
    <>
      <TopBar
        title="Leads"
        subtitle={`${counts.total} total · ${counts.lead} lead${counts.lead === 1 ? '' : 's'} · ${counts.prospect} prospect${counts.prospect === 1 ? '' : 's'}`}
      />
      <LeadsClient initialLeads={leads} />
    </>
  );
}
