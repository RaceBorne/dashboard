import { redirect } from 'next/navigation';

/**
 * /email/audience/[id] — list detail. Redirects to /leads?listId=<id>
 * so the operator works with members in the SAME UI as /leads. The
 * gold banner on the scoped /leads view exposes list-management
 * actions (rename, delete, add members) so nothing is lost.
 */
export default async function ListDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/leads?listId=${encodeURIComponent(id)}`);
}
