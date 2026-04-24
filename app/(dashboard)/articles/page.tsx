import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /articles → /journals redirect.
 *
 * The unified long-form composer moved to /journals (split into two
 * lanes: CS+ | Bike Builds and Blogs). This stub keeps any existing
 * bookmarks / shared links alive.
 */
export default function ArticlesRedirect() {
  redirect('/journals');
}
