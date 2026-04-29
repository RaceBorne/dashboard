import { redirect } from 'next/navigation';

/**
 * Idea detail page is now folded into /strategy?playId=. Redirect any
 * legacy bookmarks / direct URLs to the canonical strategy surface.
 */
export const dynamic = 'force-dynamic';

export default async function IdeaIdRedirect({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect('/strategy?playId=' + encodeURIComponent(id));
}
