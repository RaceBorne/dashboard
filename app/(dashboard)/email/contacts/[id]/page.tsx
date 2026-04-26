import { redirect } from 'next/navigation';

/**
 * Phase 5 unification — the old per-contact detail route is replaced by
 * the three-pane explorer's right pane. Redirect any deep-link traffic
 * back to the explorer so old bookmarks / event-feed links don't 404.
 */
export const dynamic = 'force-dynamic';

export default async function ContactDetailRedirect() {
  redirect('/email/contacts');
}
