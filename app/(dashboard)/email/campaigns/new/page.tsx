import { TopBar } from '@/components/sidebar/TopBar';
import { listGroupsWithCounts } from '@/lib/marketing/groups';
import { listSegments } from '@/lib/marketing/segments';
import { getBrand } from '@/lib/marketing/brand';
import { listTemplates } from '@/lib/marketing/templates';
import { CampaignKindChooser } from '@/components/marketing/CampaignKindChooser';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Lead } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps { searchParams: Promise<{ ids?: string; kind?: string }> }

/**
 * Resolves the optional ?ids=lead_a,lead_b,... deep-link from the
 * Contacts bulk-action 'Send campaign' button into a list of emails
 * the wizard pre-populates as the audience.
 */
async function loadEmailsForLeadIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_leads')
    .select('id, payload')
    .in('id', ids);
  if (error || !data) return [];
  const out: string[] = [];
  for (const row of data as { payload: Lead }[]) {
    const e = (row.payload?.email ?? '').trim().toLowerCase();
    if (e) out.push(e);
  }
  return [...new Set(out)];
}

export default async function NewCampaignPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ids = (sp.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const [groups, segments, customEmails, brand, templates] = await Promise.all([
    listGroupsWithCounts(),
    listSegments(),
    loadEmailsForLeadIds(ids),
    getBrand(),
    listTemplates(),
  ]);
  return (
    <>
      <TopBar
        title="New campaign"
        subtitle={customEmails.length > 0
          ? `Email · Pre-loaded with ${customEmails.length} recipient${customEmails.length === 1 ? '' : 's'}`
          : 'Email · Four-step wizard'}
      />
      <CampaignKindChooser
        groups={groups}
        segments={segments}
        templates={templates}
        brand={brand}
        initialRecipientEmails={customEmails}
        seedKind={(sp as { kind?: string }).kind === 'direct' || (sp as { kind?: string }).kind === 'newsletter' ? (sp as { kind?: 'direct' | 'newsletter' }).kind ?? null : null}
      />
    </>
  );
}
