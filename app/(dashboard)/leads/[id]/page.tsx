import { redirect } from 'next/navigation';

/**
 * /leads/[id] is superseded by the inline panel on /leads. Any surviving
 * deep link is bounced to the query-param variant so the client auto-opens
 * the selected row.
 */
export default async function LegacyLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/leads?id=${encodeURIComponent(id)}`);
}
