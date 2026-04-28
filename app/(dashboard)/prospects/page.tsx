import { redirect } from 'next/navigation';

/**
 * /prospects has been collapsed into /leads as a tier filter — the
 * /leads page now lists every dashboard_leads row regardless of
 * tier, with a filter chip for Prospects vs Leads. This redirect
 * keeps any deep-linked URL working by bouncing into the same view.
 */
export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ playId?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ tier: 'prospect' });
  if (sp.playId) qs.set('playId', sp.playId);
  redirect(`/leads?${qs.toString()}`);
}
